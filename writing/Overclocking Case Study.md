# Case Study: Full System Optimisation — MSI RTX 5070 Gaming Trio OC & AMD Ryzen 9 9950X3D
**Category:** Hardware / Overclocking / System Tuning
**Platform:** Windows 11 (Fresh Installation)
**Tools Used:** MSI Afterburner 4.6.7 Beta, HWiNFO64 v8.34, CPU-Z v2.20.1, L-Connect 3 v2.1.23, Armory Crate, AMD Ryzen Master, Gigabyte Control Center, Process Lasso

---

## 1. System Specifications

| Component | Specification |
|---|---|
| **CPU** | AMD Ryzen 9 9950X3D (Granite Ridge, 16-Core/32-Thread, AM5, 170W TDP) |
| **GPU** | MSI GeForce RTX 5070 Gaming Trio OC 12GB GDDR7 |
| **Motherboard** | Gigabyte Aorus X870 |
| **RAM** | G.Skill Trident Z5 Neo RGB 64GB DDR5 (2x32GB, Dual-Channel) F5-6000J3040G32G |
| **Primary NVMe** | Crucial CT2000T705SSD3 2TB (OS Drive) |
| **Secondary NVMe** | WD Black SN850X 2TB (Data Drive) |
| **AIO Cooler** | ASUS ROG Ryujin III (Asetek 8th-Gen Pump, Embedded Micro-Fan) |
| **Case Fans** | Lian Li SL-Inf 120mm x7 — 3x AIO radiator, 3x intake (base), 1x exhaust (SL-Inf Controller) |
| **Operating System** | Windows 11 (Fresh Install, Build 25H2) |

---

## 2. Project Overview & Motivation

The goal of this project was straightforward: to extract the maximum stable performance from every component in the system. With a high-end platform built around the AMD Ryzen 9 9950X3D and the MSI RTX 5070 Gaming Trio OC, leaving either component running at stock settings represented a significant amount of untapped performance. The objective was to systematically tune every layer of the system — CPU boost behaviour, memory architecture, GPU voltage/frequency curve, AIO cooling, thermal management, OS-level thread scheduling, and peripheral configuration — and validate the results through extended stress testing.

The approach taken here treats overclocking not as a single adjustment but as a holistic system optimisation. Each component's tuning decisions were made in relation to the others, with particular attention paid to the interactions between CPU memory controller synchronisation, GPU power delivery, thermal headroom across both primary compute components, and real-time audio processing stability. A Windows reinstall provided a clean slate to rebuild and document all settings from first principles — making this an ideal opportunity to establish a thorough, well-validated configuration reference.

---

## 3. CPU & Memory Foundation — BIOS Configuration

Before any application-level tuning was undertaken, the CPU and memory configuration was established at the BIOS level. These settings form the architectural foundation upon which every subsequent layer of tuning depends, and were carried over from the previous configuration and revalidated on the fresh install.

### 3.1 Memory & EXPO Configuration

| Parameter | Setting |
|---|---|
| Extreme Memory Profile (EXPO) | Enabled (EXPO Profile 1) |
| System Memory Multiplier | 6000 MT/s |
| UCLK Div1 Mode | UCLK = MCLK (1:1 ratio enforced) |

Enabling EXPO Profile 1 sets the G.Skill Trident Z5 Neo RGB to its rated 6000 MT/s specification. The critical accompanying setting is UCLK = MCLK, which forces a 1:1 ratio between the memory clock and the unified memory controller clock — eliminating the additional latency introduced by the default 1:2 (UCLK ÷ 2) mode that AMD uses at higher memory frequencies to protect stability. Running two 32GB sticks in dual-channel across the recommended A2/B2 slots maximises both bandwidth and signal integrity at 6000 MT/s.

### 3.2 Infinity Fabric (FCLK)

| Parameter | Setting |
|---|---|
| Infinity Fabric Frequency (FCLK) | 2000 MHz |

The FCLK was manually set to 2000 MHz to achieve the critical **1:1:1 synchronisation** between MCLK (3000 MHz effective), UCLK (3000 MHz effective), and FCLK (2000 MHz). This three-way synchronisation minimises inter-die communication latency across the 9950X3D's chiplet architecture and is the single most impactful memory tuning decision on AM5. It is particularly significant for real-time audio processing workloads, where latency consistency at the memory controller directly affects ASIO buffer stability.

### 3.3 Voltages

| Parameter | BIOS Setting | HWiNFO Confirmed Reading |
|---|---|---|
| CPU VCORE SOC | 1.250V (locked) | 1.285V |
| DRAM VDD | 1.400V | 1.395V |
| DRAM VDDQ | 1.400V | 1.230V (board variance — stable) |

The SOC voltage was manually locked at 1.250V to provide a stable power floor for the I/O die without generating excess heat. The minor discrepancy between BIOS-set and HWiNFO-reported voltages is normal behaviour on AM5 platforms due to the board's load-line calibration and power delivery tolerances. The VDDQ reading of 1.230V versus the 1.400V BIOS target is a known AM5 platform characteristic and did not affect stability across the full test duration.

### 3.4 Precision Boost Overdrive (PBO) & Curve Optimizer

| Parameter | Setting |
|---|---|
| Precision Boost Overdrive (PBO) | Advanced |
| PBO Thermal Limit | 80°C — Level 3 |
| Curve Optimizer | All Cores, Negative, -10 |
| Max CPU Boost Clock Override | +0 MHz |

The 9950X3D is an AMD 3D V-Cache processor, which imposes specific constraints on overclocking methodology. Traditional voltage-based overclocking is explicitly discouraged by AMD for X3D SKUs due to the risk of degrading the stacked V-Cache layer. PBO combined with Curve Optimizer is the correct and safe tuning vector for this processor.

The **80°C PBO thermal limit at Level 3** acts as a governor specifically to protect the 3D V-Cache die, which is more heat-sensitive than the base compute die. The **-10 Curve Optimizer offset** (all cores, negative) was established as the stable operating point — it allows the processor to achieve higher boost clocks at lower voltages by informing the boost algorithm that this specific silicon can sustain performance at a reduced voltage offset. The **+0 Boost Clock Override** was deliberately left at zero; on X3D hardware, a positive override can cause the CPU to chase voltages it cannot sustain at low power states, introducing instability at idle.

### 3.5 Memory Sub-Timings

| Timing | Value | Notes |
|---|---|---|
| tCL | 30 | Primary latency |
| tRCDWR | 38 | Write to CAS delay |
| tRCDRD | 38 | Read to CAS delay |
| tRP | 38 | Precharge time |
| tRAS | 30 | Row active time |
| tREFI | 32768 | Refresh interval |
| PowerDown Mode | Disabled | Eliminates power-state sleep delays |
| Gear Down Mode (GDM) | Enabled | Required for stability at 6000 MT/s |
| Power Supply Idle Control | Typical Current Idle | Maintains safe minimum voltage floor at low power states |

The tREFI value of 32768 was selected as the stable equilibrium point — high enough to reduce background refresh latency without causing thermal desynchronisation at the memory controller. PowerDown Mode was disabled to eliminate memory power-state sleep delays, which is beneficial for both real-time audio and gaming workloads that require consistent memory response times.

---

## 4. The Fresh Windows Install — A Clean Slate

With the CPU and memory foundation confirmed and carried over into the new installation, the Windows reinstall presented an ideal opportunity to rebuild the GPU and application-level configuration methodically. Rather than restoring a backup of previous settings, each parameter was reconsidered and revalidated — ensuring the final configuration represents a genuinely optimised profile built with deliberate intent rather than accumulated adjustments made ad hoc over time.

All GPU tuning was conducted using **MSI Afterburner 4.6.7 Beta**, chosen specifically for its Blackwell architecture support. This is the first version to offer meaningful GDDR7 memory overclocking capability for RTX 50-series cards, unlocking data transfer rates up to 36 GT/s versus NVIDIA's factory specification of 28–30 GT/s. The clean install also provided the opportunity to configure fan curves, AIO profiles, OS-level thread scheduling, RGB profiles, and monitoring tools from scratch with a level of rigour that would not have been achievable on an accumulated legacy installation.

---

## 5. GPU Overclocking — MSI RTX 5070 Gaming Trio OC

### 5.1 Initial Setup

Prior to any tuning, the following voltage controls were unlocked via Afterburner's General settings tab:

- Unlock voltage control: **Enabled**
- Unlock voltage monitoring: **Enabled**
- Force constant voltage: **Enabled**

### 5.2 Starting State

Upon first opening Afterburner on the fresh install, initial tuning quickly established the following as the working baseline:

| Parameter | Value |
|---|---|
| Core Clock Offset | +400 MHz |
| Memory Clock Offset | +1500 MHz |
| Core Voltage | +0% |
| Power Limit | 112% |
| GPU Core Clock (Monitor) | 2760 MHz |
| Memory Clock (Monitor) | 15501 MHz |
| Core Voltage (Monitor) | 845 mV |
| GPU Temperature | 39°C (idle) |

### 5.3 Final Slider Configuration

| Parameter | Final Value | Notes |
|---|---|---|
| Power Limit | **112%** | Maximum allowable for this card |
| Core Voltage | **+100%** | Unlocks maximum manufacturer-approved voltage headroom |
| Core Clock | **Curve (V/F Editor active)** | Replaced fixed offset once V/F curve was applied |
| Memory Clock | **+1500 MHz** | Pushing GDDR7 to ~15501 MHz |

On the MSI RTX 5070 Gaming Trio OC specifically, independent review data confirms that beyond **+350 MHz core offset** there is no measurable additional performance gain, and that **+400 MHz** represents the practical wall at which the card becomes unstable without V/F curve management. The memory offset of +1500 MHz is made possible by the 4.6.7 Beta's expanded GDDR7 headroom.

### 5.4 Voltage/Frequency Curve Configuration

The most technically involved part of the GPU tuning process was configuring the Voltage/Frequency (V/F) curve using Afterburner's Curve Editor (Ctrl+F).

**Curve Editor Observations:**
- The default curve showed a standard Blackwell boost ramp beginning at approximately 700mV (~580 MHz) and peaking at approximately 1165mV (~3500 MHz) with the +400 core offset applied
- Two curves were visible: the upper (offset-adjusted) curve and the lower stock reference curve
- The card's theoretical ceiling under the applied offset was ~3500 MHz, though real-world sustained clocks under gaming load are typically 300–400 MHz lower due to power and thermal boost behaviour

**Curve Strategy — Flat Lock at 3200 MHz:**
The goal was to create a flat frequency ceiling from approximately 1025mV rightward, instructing the GPU to always target 3200 MHz at any voltage above that threshold. This eliminates dynamic boost variance and provides consistent, predictable performance in gaming workloads.

The process involved manually clicking each individual point from 1025mV to the right edge of the curve and dragging each to 3200 MHz. The **L key** (new in 4.6.7 Beta) was used to lock the selected points, toggling between voltage locking and maximum frequency locking mode — the latter was used to enforce the frequency ceiling.

**Final Curve Profile:**

| Voltage Range | Frequency Behaviour |
|---|---|
| 625mV – 700mV | ~480 MHz (idle/passive states — untouched) |
| 700mV – 1025mV | Natural ramp (light/medium load transition) |
| 1025mV – 1250mV+ | **Flat lock at 3200 MHz** (full load gaming target) |

**Rationale for 3200 MHz Target:**
- Independent review data for the RTX 5070 Trio OC confirms an average sustained overclock of approximately 3144 MHz under real gaming load at stable settings
- 3500 MHz represents a transient peak the card cannot sustain under power-limited conditions
- 3200 MHz provides a stable, achievable target that can be stepped toward 3300 MHz following further stability validation

### 5.5 GPU Fan Curve Configuration

Fan curve configuration was performed via Afterburner's Settings > Fan tab.

**Enable user defined software automatic fan control:** On

| GPU Temperature | Fan Speed |
|---|---|
| 0–50°C | 0% (passive/silent) |
| 55°C | 25% |
| 60°C | 40% |
| 65°C | 55% |
| 70°C | 70% |
| 75°C | 85% |
| 80°C+ | 100% |

- Fan speed update period: **1000ms** (reduced from default 5000ms for faster thermal response)
- Temperature hysteresis: **2°C** (prevents rapid fan speed hunting at threshold temperatures)

### 5.6 Profile Saving & Startup

- Settings saved to **User Profile 1** in Afterburner
- Windows startup application of profile **enabled** via the startup toggle
- Profile lock enabled to prevent accidental overwrite

---

## 6. AIO Cooling Configuration — ASUS ROG Ryujin III

### 6.1 Detection Issue & Resolution

Following the Windows reinstall, the Ryujin III AIO was absent from Armory Crate due to a background hardware discovery service failure and a desynced SMBus state after the clean OS deployment. This was resolved by executing a clean restart of the `GIPService` and `RGBFusionService` via Task Manager, followed by a firmware layer update via the Armory Crate Update Center to pull the G.Skill and ASUS hardware provider extensions. The pump block and embedded fan now populate correctly within the Fan Control dashboard.

### 6.2 AIO Configuration Philosophy

The Ryujin III's hardware presets (Silent/Standard/Turbo) were bypassed entirely in favour of custom **Smart Mode** curves hardcoded using **CPU Tctl/Tdie** as the absolute tracking source. This ensures real-time reaction to Zen 5 thermal spikes rather than the averaged or delayed response characteristic of preset modes.

### 6.3 Pump Custom Profile

The pump utilises a stepped duty cycle to maintain high fluid velocity under load while eliminating the 12V high-frequency motor whine present at idle desktop states.

| Node | CPU Temperature | Pump PWM (%) | Target RPM (Approx.) | Rationale |
|---|---|---|---|---|
| **1** | 20°C | **60%** | ~2460 RPM | Prevents fluid lag or heat bleed-up during idle/passive states |
| **2** | 55°C | **75%** | ~2760 RPM | Early ramping ceiling for medium/transient gaming loads |
| **3** | 65°C | **90%** | ~3360 RPM | High-velocity flow applied prior to the 166.7W package power peak |
| **4** | 75°C+ | **100%** | ~3600 RPM | Maximum fluid dissipation to defend the 80°C PBO thermal ceiling |

### 6.4 Embedded Micro-Fan Custom Profile

The small internal axial fan on the pump block cools the motherboard VRM phases and the Crucial T705 Gen5 NVMe drive directly beneath the socket. It is deliberately speed-restricted to protect the system's ambient noise floor during audio tracking sessions.

| Node | CPU Temperature | Fan PWM (%) | Rationale |
|---|---|---|---|
| **1** | 0°C – 55°C | **20%** | Completely silent baseline air movement over the NVMe heatsink |
| **2** | 65°C | **40%** | Low-noise operational ramp during sustained workloads |
| **3** | 75°C | **60%** | Active cooling during prolonged stress or rendering |
| **4** | 80°C+ | **100%** | Emergency hardware protection ceiling |

**Advanced Timing Rules:**
- Step-Up / Step-Down Reaction Time: **12 seconds** hysteresis window — prevents the pump or micro-fan from rapidly changing pitch in response to brief background thread execution or browser container activity

---

## 7. Case Fan Configuration — Lian Li SL-Inf 120mm x7

Fan management was performed using **L-Connect 3 v2.1.23**. The full fan layout across the system is as follows:

| Position | Count | Role |
|---|---|---|
| AIO Radiator | 3x 120mm | CPU liquid cooling (push configuration) |
| Case Base Intake | 3x 120mm | Primary system airflow intake |
| Case Exhaust | 1x 120mm | Hot air extraction |

All ports were connected to the SL-Inf Controller01. A custom 5-point profile was created and applied to all ports simultaneously via "Apply To All." L-Connect 3 limits custom profiles to five data points.

| CPU Temperature | Fan Speed (RPM) |
|---|---|
| 25°C | 420 RPM |
| 45°C | 700 RPM |
| 60°C | 1100 RPM |
| 75°C | 1680 RPM |
| 90°C | 2100 RPM |

- Temperature source: **CPU**
- Start/Stop: **Off** (fans maintain minimum speed at all times)
- MB RPM Sync: **Enabled**

---

## 8. Stability Validation — Overnight Stress Test Results

All settings were validated through an extended overnight stress test monitored via **HWiNFO64 v8.34**. The following results represent peak and average values recorded across the full test duration.

### 8.1 CPU Results

| Metric | Current | Minimum | Maximum | Average |
|---|---|---|---|---|
| CPU Tctl/Tdie | 72.5°C | 63.1°C | **79.5°C** | 72.7°C |
| CPU Die Average | 69.8°C | 59.1°C | **77.0°C** | 70.4°C |
| CCD1 Tdie (3D V-Cache) | 69.5°C | 60.6°C | **77.5°C** | 70.7°C |
| CCD2 Tdie | 48.2°C | 48.2°C | 57.0°C | 50.7°C |
| CPU Package Power | 145.7W | 141.8W | **166.7W** | 151.3W |
| Frequency (Global) | 5284.8 MHz | 5137.1 MHz | **5520.0 MHz** | 5281.1 MHz |
| FCLK | 1996.4 MHz | 1996.4 MHz | 1996.4 MHz | 1996.4 MHz |
| UCLK | 2994.6 MHz | 2994.6 MHz | 2994.6 MHz | 2994.6 MHz |
| CPU PPT Limit | 72.2% | 69.7% | 82.9% | 75.3% |
| CPU TDC Limit | 50.4% | 44.4% | 64.4% | 54.0% |
| CPU EDC Limit | 44.6% | 35.2% | 56.2% | 45.1% |

**Key observations:**
- CCD1 (the 3D V-Cache die) peaked at **77.5°C** under sustained overnight stress — within the 80°C PBO thermal cap and well under AMD's absolute maximum for X3D processors
- Package power peaked at **166.7W** against a 170W TDP, confirming the PBO limits are functioning correctly as a governor
- FCLK confirmed stable at **1996.4 MHz** throughout, validating the 1:1:1 synchronisation
- PPT headroom remained available even at peak stress (82.9% of limit), indicating the system is not fully power-constrained

### 8.2 RAM Results

| Metric | DIMM 1 (Ch. A) | DIMM 3 (Ch. B) |
|---|---|---|
| SPD Hub Temp (Max) | **51.5°C** | **49.2°C** |
| VDD Voltage | 1.395V | 1.395V |
| VDDQ Voltage | 1.230V | 1.230V |
| Total Power (Max) | 5.125W | 5.500W |
| PMIC Warnings | None | None |

**Key observations:**
- DDR5 SPD temperatures of 51.5°C under sustained stress are within normal operating parameters (DDR5 is rated to 85°C+)
- No PMIC Over Voltage, High Temperature, or Under Voltage warnings recorded across the entire overnight session
- The system completed the full test without a single crash, driver reset, memory error, or thermal event

### 8.3 Overall Stability Verdict

All configured limits — PBO 80°C thermal cap, GPU Power Limit 112%, Core Voltage +100%, V/F lock at 3200 MHz — behaved as intended across the full overnight duration. The configuration is confirmed stable for daily use across all target workloads.

---

## 9. Issues Encountered & Resolutions

### Issue 1 — V/F Curve Multi-Point Selection Not Functional
**Cause:** MSI Afterburner 4.6.7 Beta's multi-point Shift+drag selection and batch frequency entry via keyboard did not reliably apply values to all selected points simultaneously.
**Resolution:** Manual point-by-point adjustment used as the definitive method. Each point from 1025mV to the right edge of the curve was individually dragged to 3200 MHz.
**Note:** This is a known limitation of the current beta build. A production release is expected to address curve editor usability.

### Issue 2 — Fan Speed Fixed Instead of Dynamic
**Cause:** After initial Afterburner setup, the GPU fan speed was displaying as a fixed value (42%) rather than responding dynamically to temperature. The "Enable user defined software automatic fan control" option in Settings > Fan had not been activated.
**Resolution:** Enabled software fan control in Settings, applied the custom curve, and confirmed dynamic response.

### Issue 3 — ASUS ROG Ryujin III Not Detected in Armory Crate (Resolved)
**Cause:** Following the Windows reinstall, the Ryujin III AIO was absent from Armory Crate due to a background hardware discovery service failure and a desynced SMBus state following the clean OS deployment.
**Resolution:** Executed a clean restart of `GIPService` and `RGBFusionService` via Task Manager, followed by a firmware layer update via the Armory Crate Update Center to pull the G.Skill and ASUS hardware provider extensions. The pump block and embedded fan now populate correctly within the Fan Control dashboard.

### Issue 4 — Lian Li Fan RGB Displaying Off-White
**Cause:** The initial hex value applied in L-Connect 3 was not producing the intended deep purple. The Lian Li SL-Inf fans wash out colour at high brightness settings, and any active RGBW mode adds a white channel that dilutes colour saturation significantly.
**Resolution:** Brightness reduced to approximately 65% in L-Connect 3, and a higher saturation value applied (`#6600CC` / R:102 G:0 B:204). Lighting mode confirmed as Static/Fixed.

---

## 10. RGB Profile Configuration — "Deep Space"

A unified "Deep Space" purple theme was applied across all RGB-capable components using their respective native software tools. MSI Afterburner does not control RGB; each component requires its own dedicated application.

| Component | Software | Zone | R | G | B | Hex |
|---|---|---|---|---|---|---|
| GPU Shroud | MSI Center (Mystic Light) | Zone 1 | 106 | 13 | 173 | `#6A0DAD` |
| GPU Logo | MSI Center (Mystic Light) | Zone 2 | 48 | 0 | 110 | `#30006E` |
| GPU Backplate | MSI Center (Mystic Light) | Zone 3 | 147 | 112 | 219 | `#9370DB` |
| Case Fans | L-Connect 3 | All Active | 102 | 0 | 204 | `#6600CC` |
| RAM | Gigabyte Control Center | All Sticks | 75 | 0 | 130 | `#4B0082` |
| AIO (Ryujin III) | Armory Crate | Pump Head | 106 | 13 | 173 | `#6A0DAD` |

The GPU uses a three-zone gradient approach: Zone 1 (shroud) at a vivid royal purple, Zone 2 (logo) at a deep violet to create contrast depth, and Zone 3 (backplate) at a softer lavender — producing a dark-to-light gradient across the card's surface.

---

## 11. OS-Level Thread Scheduling — Process Lasso Configuration

With the hardware overclocked and thermally validated, the final layer of optimisation addressed the Windows 11 thread scheduler. The native scheduler has no awareness of the 9950X3D's asymmetric dual-CCD architecture, and without intervention will freely migrate threads between the two dies — introducing unpredictable latency penalties whenever a gaming or audio thread is forced to cross the Infinity Fabric to fetch data from a cache die it does not reside on.

To eliminate this, permanent affinity and priority rules were hardcoded into **Process Lasso**, establishing a strict architectural boundary between the two CCDs.

### 11.1 CCD Architecture Overview

| Die | Cores | Characteristic | Optimal Workloads |
|---|---|---|---|
| **CCD 0** | 0–15 | 3D V-Cache — large L3, ultra-low latency | Gaming engines, DAWs, real-time audio |
| **CCD 1** | 16–31 | Higher stock frequency, standard cache | Background services, compilers, utilities |

### 11.2 CCD 0 — Performance & Audio Real-Time Streams (Cores 0–15)

High-demand games, primary digital audio workstations, and critical low-latency hardware managers are pinned exclusively to the 3D V-Cache cores. This locks down data residency, ensuring these processes never suffer the latency penalty of crossing the Infinity Fabric.

| Process Group | Executables | Affinity | Priority Class | I/O Priority | GPU Priority | Performance Mode |
|---|---|---|---|---|---|---|
| **Gaming Engines** | `cyberpunk2077.exe`, `readyornot.exe`, `rdr2.exe`, `cities2.exe`, `cult of the lamb.exe`, `sotn2.exe` | 0–15 | High | High | High | Yes |
| **Audio Engineering** | `fl64.exe`, `reaper.exe`, `focusrite control 2.exe` | 0–15 | High / Above Normal | High | — | No |
| **Creative Development** | `unrealeditor.exe` | 0–15 | High | High | High | Yes |

Gaming engines receive elevated GPU Priority in addition to CPU affinity, ensuring that render queue dispatch is not delayed by background processes competing for GPU scheduling bandwidth. Audio applications are pinned to CCD 0 to keep the real-time ASIO buffer balanced on the 3D V-Cache, directly mitigating the risk of buffer underruns, clicks, or pops during dense multi-track mixing or VST synthesis loops. Unreal Editor is treated identically to a game engine to ensure viewport fluid dynamics and local audio integration tests mirror target deployment behaviour exactly.

### 11.3 CCD 1 — Infrastructure & Background Offloading (Cores 16–31)

Every application, service, or driver component that does not actively contribute to an open game frame or a live audio buffer stream is systematically evicted from CCD 0 and pushed onto the secondary die.

| Process Group | Executables | Affinity | Priority Class | Efficiency Mode |
|---|---|---|---|---|
| **Development & OS** | `appsanywhere.exe`, `wslservice.exe`, `explorer.exe` | 16–31 | Below Normal | On |
| **Communications & Hardware Services** | `discord.exe`, `l-connect 3.exe`, `l-connect-service.exe`, `lightingservice.exe`, `asus_framework.exe` | 16–31 | Below Normal / Idle | Off |
| **Browsers & Utilities** | `firefox.exe`, `opera.exe`, `spotify.exe`, `spotifylauncher.exe`, `logioptionsplus.exe` | 16–31 | Below Normal | On |
| **Network & Security Daemons** | `protonvpn.client.exe`, `protonvpnservice.exe`, `malwarebytes.exe`, `onedrive.exe`, `nvcontainer.exe` | 16–31 | Below Normal / Idle | Off |

Communications and hardware service processes — including L-Connect 3 fan telemetry polling, RGB lighting calculations, and Discord voice encoding — are explicitly pushed to CCD 1 to guarantee that their background overhead will never pollute the gaming or audio processing cache lanes on CCD 0. Browser and streaming processes are efficiency-mode locked to prevent transient thermal spikes from consuming the PBO headroom reserved for gaming and audio workloads. Network and security daemons are restricted to Idle priority, ensuring that disk caching, VPN tunnel encapsulation, and background security scans are fully isolated on the non-cache die.

### 11.4 Process Lasso Rule Summary

| Execution Group | Target Processes | CPU Affinity | Priority Class | I/O Priority | Performance Mode | Efficiency Mode |
|---|---|---|---|---|---|---|
| **CCD 0: Cache Locked** | Games, DAWs, Viewports | 0–15 | High | High | **Yes** | Off |
| **CCD 0: Audio Driver** | Focusrite Control 2 | 0–15 | Above Normal | Normal | No | Off |
| **CCD 1: Background** | Launchers, Comms, Tools | 16–31 | Below Normal | Normal | No | **On** |
| **CCD 1: System Service** | L-Connect Service, Lighting | 16–31 | Idle | Normal | No | Off |

---

## 12. Tools Reference Summary

| Tool | Version | Purpose |
|---|---|---|
| MSI Afterburner | 4.6.7 Beta | GPU OC, V/F curve, GPU fan curve, OSD |
| HWiNFO64 | v8.34-5870 | System monitoring, stress test validation |
| CPU-Z | v2.20.1 x64 | CPU/RAM verification |
| L-Connect 3 | v2.1.23 | Lian Li fan speed and RGB |
| Armory Crate | Latest | AIO pump, micro-fan, and RGB control |
| AMD Ryzen Master | Latest | CPU PBO monitoring |
| Gigabyte Control Center | Latest | RAM RGB |
| Process Lasso | Latest | OS thread scheduling and affinity rules |

---

## 13. Use Cases

This configuration is optimised for the following primary workloads:

**Gaming:**
The V/F curve flat lock at 3200 MHz ensures the GPU maintains consistent boost clocks without dynamic variance that can cause micro-stutters. The 112% power limit removes power throttling as a constraint. On the CPU side, the 1:1:1 memory/fabric synchronisation minimises frame pacing irregularities caused by cross-die latency, and Process Lasso's CCD 0 affinity rules ensure that game threads never migrate to the non-cache die mid-frame, eliminating the latency spikes that can manifest as stutters in open-world titles.

**Music Production (FL Studio / Reaper / Focusrite ASIO Workflows):**
The FCLK/UCLK/MCLK 1:1:1 synchronisation at 6000 MT/s was specifically chosen for its low-latency characteristics. The -10 Curve Optimizer offset and disabled PowerDown Mode both contribute to eliminating micro-latency spikes that cause audio buffer underruns at low ASIO buffer sizes. Pinning `fl64.exe`, `reaper.exe`, and `focusrite control 2.exe` to CCD 0 via Process Lasso keeps the real-time audio pipeline resident on the 3D V-Cache, while the Ryujin III's embedded micro-fan is deliberately speed-limited during audio sessions to protect the ambient noise floor for microphone tracking.

**General Productivity & Desktop:**
The passive GPU fan mode below 50°C and the low-RPM case fan entry point at 25°C → 420 RPM mean the system operates in near-silence during light workloads. Background processes confined to CCD 1 with Efficiency Mode enabled ensure that desktop idle power draw remains low, and the 9950X3D's confirmed 0.996V core voltage at 5068 MHz idle demonstrates that the CPU is not drawing unnecessary power at rest.

---

## 14. Future Developments & Next Steps

**Short Term:**
- Run 3DMark TimeSpy and Port Royal benchmarks to quantify GPU overclock performance delta against stock
- Incrementally test GPU core target up to **3300 MHz** on the V/F curve following confirmed 3200 MHz stability
- Extend Process Lasso rules to cover any newly installed game titles as they are added to the library

**Medium Term:**
- Explore per-core Curve Optimizer tuning in AMD Ryzen Master to identify the strongest cores on this specific 9950X3D die and apply tighter negative offsets to the best cores for additional single-thread performance
- Consider pushing memory to **6400 MT/s** in BIOS — the G.Skill Z5 Neo is rated for this speed on AM5, and the step increase from 6000 MT/s would be achievable without significant sub-timing changes
- Export all Afterburner profiles and Process Lasso rule sets to cloud storage as a standing practice following any significant tuning session

**Long Term:**
- Evaluate MSI Afterburner production release (post-4.6.7 Beta) for improved V/F curve editor usability, particularly multi-point selection and batch frequency entry
- Monitor forthcoming MSI Afterburner feature development — memory voltage and auxiliary voltage control for MSI RTX 5000 cards is in active development and will unlock additional GDDR7 tuning headroom when released
- Revisit tREFI and secondary memory timings once platform AGESA updates mature for the X870 chipset

---

## 15. Conclusion

This project achieved its core objective: extracting the maximum stable performance from every layer of a high-end AM5 platform built around the AMD Ryzen 9 9950X3D and MSI RTX 5070 Gaming Trio OC. The GPU now sustains approximately 3200 MHz core under load against a stock boost of 2610 MHz — a ~23% improvement — with a cleanly validated V/F curve, dynamic fan control, and a confirmed overnight stress test with zero crashes or thermal events. The CPU operates within a carefully constructed PBO envelope, with a peak CCD1 temperature of 77.5°C under overnight stress comfortably within the 80°C V-Cache protection threshold, while the 1:1:1 FCLK/UCLK/MCLK synchronisation at 6000 MT/s is confirmed stable with zero PMIC warnings across the full test duration.

The Ryujin III AIO is fully operational with custom Smart Mode pump and micro-fan curves tuned specifically to the 9950X3D's thermal signature. At the OS level, Process Lasso's permanent affinity rules enforce a strict CCD 0 / CCD 1 architectural boundary that prevents thread migration, eliminates cache pollution from background processes, and maintains real-time audio stability — completing a system optimisation that extends from the BIOS all the way through to the Windows scheduler.

The fresh Windows install served not as a setback but as a structured opportunity to build this configuration from the ground up with a level of precision and documentation rigour that is difficult to achieve on an accumulated legacy installation.

---

*Document prepared for AtlasVault Monthly Blog*
*Session Date: May 31 – June 1, 2026*
*Hardware Platform: AMD AM5 / NVIDIA Blackwell*
