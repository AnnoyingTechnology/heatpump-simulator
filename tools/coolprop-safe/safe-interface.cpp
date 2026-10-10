// Project-owned exception boundary; CoolProp itself remains pinned and unmodified.
#include "CoolProp/AbstractState.h"
#include "CoolProp/CoolProp.h"
#include "CoolProp/HumidAirProp.h"
#include <emscripten/emscripten.h>
#include <cmath>
#include <cstring>
#include <limits>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>

namespace {
struct State { std::unique_ptr<CoolProp::AbstractState> eos; bool valid = false; };
std::map<unsigned, State> states;
unsigned next_id = 1;
constexpr double invalid = std::numeric_limits<double>::quiet_NaN();
void message(char* out, unsigned size, const char* text) noexcept {
    if (out && size) { std::strncpy(out, text, size - 1); out[size - 1] = 0; }
}
State& state(unsigned id) {
    auto found = states.find(id);
    if (found == states.end()) throw std::invalid_argument("Unknown/deleted state");
    return found->second;
}
void invalidate(unsigned id) noexcept {
    auto found = states.find(id);
    if (found != states.end()) { found->second.valid = false; found->second.eos.reset(); }
}
void check_finite(double x) { if (!std::isfinite(x) || std::abs(x) > 1e30) throw std::domain_error("Nonfinite/out-of-range EOS result"); }
CoolProp::input_pairs pair(unsigned index) {
    switch (index) {
        case 0: return CoolProp::PT_INPUTS;
        case 1: return CoolProp::HmassP_INPUTS;
        case 2: return CoolProp::PSmass_INPUTS;
        case 3: return CoolProp::PQ_INPUTS;
        case 4: return CoolProp::QT_INPUTS;
        case 5: return CoolProp::DmassP_INPUTS;
        case 6: return CoolProp::DmassUmass_INPUTS;
        case 7: return CoolProp::DmassT_INPUTS;
        default: throw std::invalid_argument("Unsupported input pair");
    }
}
}

// Every operation touching native EOS/string allocation is inside a catch boundary.
// Read failure invalidates the state too: stale values cannot escape after any fault.
extern "C" {
EMSCRIPTEN_KEEPALIVE unsigned hp_create(const char* backend, const char* fluid, char* error, unsigned size) {
    message(error, size, "");
    try {
        if (!backend || !fluid) throw std::invalid_argument("Missing backend/fluid string");
        if (std::string(backend) != "HEOS" || std::string(fluid) != "R32") throw std::invalid_argument("Only HEOS R32 is supported");
        if (next_id == 0) throw std::overflow_error("State handle space exhausted");
        State fresh; fresh.eos.reset(CoolProp::AbstractState::factory("HEOS", "R32"));
        unsigned id = next_id++; states.emplace(id, std::move(fresh)); return id;
    } catch (const std::exception& e) { message(error, size, e.what()); }
      catch (...) { message(error, size, "Unknown native create error"); }
    return 0;
}
EMSCRIPTEN_KEEPALIVE int hp_destroy(unsigned id, char* error, unsigned size) {
    message(error, size, "");
    try { state(id); states.erase(id); return 0; }
    catch (const std::exception& e) { message(error, size, e.what()); }
    catch (...) { message(error, size, "Unknown native destroy error"); }
    return 1;
}
EMSCRIPTEN_KEEPALIVE int hp_update(unsigned id, unsigned input, double a, double b, char* error, unsigned size) {
    message(error, size, "");
    try {
        State& s = state(id); s.valid = false;
        check_finite(a); check_finite(b); auto inputs = pair(input);
        if (!s.eos) s.eos.reset(CoolProp::AbstractState::factory("HEOS", "R32"));
        s.eos->update(inputs, a, b);
        check_finite(s.eos->T()); check_finite(s.eos->p()); check_finite(s.eos->rhomass());
        if (!(s.eos->T() > 0 && s.eos->p() > 0 && s.eos->rhomass() > 0))
            throw std::domain_error("Nonpositive computed state");
        s.valid = true; return 0;
    } catch (const std::exception& e) { message(error, size, e.what()); }
      catch (...) { message(error, size, "Unknown native update error"); }
    invalidate(id); return 1;
}
EMSCRIPTEN_KEEPALIVE double hp_read(unsigned id, unsigned output, char* error, unsigned size) {
    message(error, size, "");
    try {
        State& s = state(id);
        if (!s.valid || !s.eos) throw std::logic_error("State has no successful update");
        double value;
        switch (output) {
            case 0: value = s.eos->T(); break;
            case 1: value = s.eos->p(); break;
            case 2: value = s.eos->hmass(); break;
            case 3: value = s.eos->smass(); break;
            case 4: value = s.eos->rhomass(); break;
            case 5: value = s.eos->Q(); break;
            case 6: value = s.eos->cpmass(); break;
            case 7: value = s.eos->viscosity(); break;
            case 8: value = s.eos->speed_sound(); break;
            default: throw std::invalid_argument("Unsupported getter");
        }
        check_finite(value); return value;
    } catch (const std::exception& e) { message(error, size, e.what()); }
      catch (...) { message(error, size, "Unknown native read error"); }
    invalidate(id); return invalid;
}
EMSCRIPTEN_KEEPALIVE double hp_props(const char* output, const char* key1, double a, const char* key2, double b,
                                   const char* fluid, char* error, unsigned size) {
    message(error, size, "");
    try {
        if (!output || !key1 || !key2 || !fluid) throw std::invalid_argument("Missing PropsSI string");
        if (std::string(fluid) != "R32") throw std::invalid_argument("Only R32 is supported");
        check_finite(a); check_finite(b);
        double value = CoolProp::PropsSI(output, key1, a, key2, b, fluid); check_finite(value); return value;
    } catch (const std::exception& e) { message(error, size, e.what()); }
      catch (...) { message(error, size, "Unknown native PropsSI error"); }
    return invalid;
}
EMSCRIPTEN_KEEPALIVE double hp_haprops(const char* output, const char* key1, double a, const char* key2, double b,
                                     const char* key3, double c, char* error, unsigned size) {
    message(error, size, "");
    try {
        if (!output || !key1 || !key2 || !key3) throw std::invalid_argument("Missing humid-air string");
        check_finite(a); check_finite(b); check_finite(c);
        double value = HumidAir::HAPropsSI(output, key1, a, key2, b, key3, c); check_finite(value); return value;
    } catch (const std::exception& e) { message(error, size, e.what()); }
      catch (...) { message(error, size, "Unknown native humid-air error"); }
    return invalid;
}
}
