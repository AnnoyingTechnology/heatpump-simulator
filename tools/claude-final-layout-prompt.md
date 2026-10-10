Continue with Sonnet 5.5. Read AGENTS.md. You own src/style.css, src/chrome.ts, src/inspector.ts and design/interface-design.md in this pass. Do not edit engine/runtime/main/state/tests/sidebar/scene. Pure vector artwork.

Parent's browser checks passed and corner panels fit internally, but rendered five-room frosting reveals the top stage header becomes 200+ px tall: the ice chip is squeezed to ~85px between the wide mismatch notice and zoom tabs, wrapping every few words. This shrinks the entire diagram and makes room numbers too small. Fix the header layout deliberately, with a compact reserved row or two and sensible minimum widths. Do not remove truthful model/source/held-inventory notices. Aim for a useful diagram at 1440x900 and 1600x1000, including five rooms, held state and the longer frosting example explanation. Keep outdoor controls permanently visible. The legend remains a reserved bottom row, not a hardware overlay. Do not hide meaningful status text in tooltips as the only access.

Add a one-click Equipment editing action in the outdoor exchanger inspector, for outdoor cleanliness and coil inputs. Expand the inspector tab callback union and handler to accept equipment; main's callback uses the existing generic tab store update and should already accept it without edits. Keep indoor Edit room inputs and pipe actions.

Requested-speed wording: live speeds are CPU-limited with one worker task in flight, so requested x10 doesn't guarantee x10. Put a concise explanation on the existing speed control (title or adjacent accessible helper), and retain actual Simulation time. This technical detail helps a meaningful user decision; keep it compact.

Report changed files, geometry assumptions and unverified cases. Do not run Bash/build/browser; parent will verify.
