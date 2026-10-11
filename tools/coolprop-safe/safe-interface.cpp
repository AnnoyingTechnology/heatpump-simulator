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
#include <sstream>
#include <iomanip>

namespace {
bool supported(const std::string& fluid) {
    return fluid == "R32" || fluid == "R22" || fluid == "n-Propane" || fluid == "R134a" || fluid == "R1234yf" || fluid == "R407C-mix" || fluid == "R410A-mix" || fluid == "R410A";
}
std::unique_ptr<CoolProp::AbstractState> create(const std::string& fluid) {
    if (!supported(fluid)) throw std::invalid_argument("Unsupported refrigerant identifier");
    const bool blend = fluid == "R407C-mix" || fluid == "R410A-mix";
    std::unique_ptr<CoolProp::AbstractState> result(CoolProp::AbstractState::factory("HEOS",
      fluid == "R407C-mix" ? "R32&R125&R134a" : fluid == "R410A-mix" ? "R32&R125" : fluid));
    if (blend) result->set_mass_fractions(fluid == "R407C-mix" ? std::vector<CoolPropDbl>{.23,.25,.52} : std::vector<CoolPropDbl>{.5,.5});
    return result;
}
struct State { std::unique_ptr<CoolProp::AbstractState> eos; bool valid = false; std::string fluid; };
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
        if (std::string(backend) != "HEOS" || !supported(fluid)) throw std::invalid_argument("Unsupported backend/refrigerant");
        if (next_id == 0) throw std::overflow_error("State handle space exhausted");
        State fresh; fresh.fluid = fluid; fresh.eos = create(fresh.fluid);
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
        if (!s.eos) s.eos = create(s.fluid);
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
            case 9: value = s.eos->Qmass(); break;
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
        if (!supported(fluid)) throw std::invalid_argument("Unsupported refrigerant identifier");
        check_finite(a); check_finite(b);
        std::string name = fluid;
        if (name == "R410A-mix" || name == "R407C-mix") {
            auto mixture = create(name); const auto& fractions = mixture->get_mole_fractions();
            const char* components[] = {"R32", "R125", "R134a"};
            std::ostringstream encoded; encoded << std::setprecision(17) << "HEOS::";
            for (unsigned i = 0; i < fractions.size(); ++i) {
                if (i) encoded << '&'; encoded << components[i] << '[' << fractions[i] << ']';
            }
            name = encoded.str();
        }
        double value = CoolProp::PropsSI(output, key1, a, key2, b, name); check_finite(value); return value;
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
