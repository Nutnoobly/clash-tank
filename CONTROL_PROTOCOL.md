# Clash Tank control protocol

Both boards subscribe to `n8q4x2m7v9p3k6t1r5z0/command_out`. The browser publishes direct control there; Python publishes voice results there. Voice input remains on `n8q4x2m7v9p3k6t1r5z0/voice_in`. All publishers use QoS 0, no retain, and no offline motion queue. All participants must use the same broker.

## Sessions and packets

An explicit selection claims a fresh, random session before sending motion. Selecting another direction or mode claims a new session and clears the previous motor queue. A new voice submission also claims a new voice session so a previous inference result cannot take over. Session IDs contain 1–64 ASCII letters, digits, `_` or `-`.

Claim (always stops existing movement):

```json
{"type":"control","source":"web","session":"example-A","mode":"joystick"}
```

Motion, repeated every 150 ms while latched:

```json
{"type":"joystick","source":"web","session":"example-A","seq":1,"action":"FORWARD","duration":500}
```

Actions are `FORWARD`, `BACKWARD`, `TURN_LEFT`, `TURN_RIGHT`. Speed and turn behavior remain as configured in the sketch. Each refresh increases `seq`; repeated/older sequences and mismatched sessions are ignored. The fixed 500 ms lease is measured using the board's `millis()` receive time, without clock synchronization. A same-direction refresh only renews that lease.

Scoped cancellation (for lifecycle cleanup) and unconditional explicit stop (center/stop button):

```json
{"type":"stop","source":"web","session":"example-A","seq":2,"action":"STOP"}
{"action":"STOP"}
```

STOP clears the motor queue and invalidates the session. Timeout and board network loss also invalidate it. Further heartbeat packets cannot rearm it; a fresh explicit selection must claim a new session. A delayed scoped STOP from an old session cannot cancel a newer owner. A bare STOP is deliberately always honored.

Voice uses a claim with `mode:"voice"`, then publishes this to `voice_in`:

```json
{"text":"เดินหน้า 1 วินาที","timestamp":1790000000000,"session":"example-B","seq":1}
```

Python preserves the request's session and sequence independently of model output:

```json
{"type":"voice","source":"voice","session":"example-B","seq":1,"commands":[{"action":"FORWARD","duration":1000}]}
```

Only one voice result is accepted for the active voice session. Neither voice packets in joystick mode nor results from an older session can start the motor queue. UNO-supported actions are `FORWARD`, `BACKWARD`, `TURN_LEFT`, `TURN_RIGHT`, `SPIN`, `STOP`, `ATTACK`; the Python schema still omits `SPIN`. Buzzer-only effects are handled by the ESP32, not the UNO motor queue. Mixed batches containing motor-unsupported actions remain rejected by the UNO.

## Servo attack (UNO R4 WiFi)

Connect the attack servo signal to pin 11. The sketch attaches `myServo` and initializes it to 90 degrees in `setup()`. Pin 11 does not overlap the existing motor pins or I2C LCD pins.

ATTACK uses the existing voice session and sequence checks. Publish a fresh claim to `command_out`, then the matching voice result (replace the example session with a fresh ID each time):

```json
{"type":"control","source":"web","session":"attack-example-A","mode":"voice"}
{"type":"voice","source":"voice","session":"attack-example-A","seq":1,"commands":[{"action":"ATTACK","duration":1000}]}
```

The topic is `n8q4x2m7v9p3k6t1r5z0/command_out`. Use QoS 0 and no retain. The two JSON objects above are separate MQTT messages. Python already allows ATTACK; no new packet type is required. Bare `{"action":"ATTACK"}` packets are rejected by design.

The UNO also accepts ATTACK from a claimed joystick session, using the same monotonically increasing sequence and exact 500 ms duration as movement packets:

```json
{"type":"control","source":"web","session":"joy-attack-A","mode":"joystick"}
{"type":"joystick","source":"web","session":"joy-attack-A","seq":1,"action":"ATTACK","duration":500}
```

Send these as separate messages. An active joystick session can use its ID and next sequence; the web attack button deliberately claims a fresh session to retire pending movement and then sends ATTACK once, without a heartbeat. An accepted attack stops the motors and queues one cycle outside the MQTT callback. Duplicate/older sequences are ignored; newer ATTACK refreshes received while the cycle is pending do not queue additional cycles. After a joystick attack finishes, the UNO invalidates the session because the blocking cycle exceeds the 500 ms lease. Further movement or attack requires a fresh claim with a new session ID; buffered packets from the previous session cannot resume the motors or repeat the attack. The web centers the joystick and waits 2500 ms after submission before allowing another attack or direction. This is a local recovery delay, not acknowledgement of execution; the operator must select a new direction explicitly.

Each queued ATTACK stops the motors and runs exactly one cycle: 91 through 180 degrees at 10 ms per step, pause 200 ms, 179 through 90 degrees at 10 ms per step, pause 200 ms. It returns to 90 degrees after approximately 2200 ms. For voice packets, the required positive `duration` field is still validated (1–60000 ms) for protocol compatibility, but does not change the attack cycle or add a hold. Consecutive voice attacks each execute once, and the queue advances after each cycle.

The cycle runs in the main loop, outside the MQTT callback. The supplied blocking delays mean MQTT messages (including STOP and new session claims), disconnect detection and status updates wait until the cycle finishes. A STOP received before execution clears the queued attack. ESP32 ignores ATTACK and continues handling DEFENSE; mixed batches containing DEFENSE remain rejected as a whole by the UNO.

## Joystick defense (web publisher only)

The web defense button claims a fresh joystick session and sends the following as two separate messages to `command_out`, QoS 0, no retain:

```json
{"type":"control","source":"web","session":"joy-defense-A","mode":"joystick"}
{"type":"joystick","source":"web","session":"joy-defense-A","seq":1,"action":"DEFENSE","duration":500}
```

The claim cancels existing movement. The browser centers the joystick, sends DEFENSE once without a heartbeat, and shows submission feedback for 350 ms. It never resumes motion automatically. `duration:500` is the joystick envelope lease, not the buzzer playback time. The current ESP32 firmware ignores joystick packets, so this web-only preparation does not yet play a defense sound. No ESP32 firmware changes are included.

## Timing and limits

- The browser clears its interval and attempts STOP on center, mode/settings changes, hidden/pagehide, focus loss in joystick mode, disconnect, or publish failure. It refuses to resume a heartbeat after an event-loop gap of 500 ms or longer.
- Direct publish callbacks time out after 300 ms. A callback confirms local transport submission, not board receipt. There is no command acknowledgement or vehicle status stream. A network path stalled downstream of the browser can expire the board lease while the UI remains latched; select center and explicitly reselect a direction to claim a fresh session.
- The 500 ms firmware deadline is a cooperative loop check, not a hard real-time guarantee. WiFiS3/PubSubClient calls can block; socket read timeout is reduced to 1 second. LCD and periodic Serial updates are skipped while driving manually. Measure real stopping latency on hardware before relying on a particular bound.
- The short lease is for joystick motion. Voice queues retain timed actions and rely on direct STOP or board disconnect detection if the browser disappears. Existing ESP32 sound playback is blocking and is not interrupted mid-sweep.
- This protocol assumes one operator. Session and sequence metadata are not authentication. Legacy untagged movement is rejected; bare STOP remains compatible. Update web, Python, and board sketches together.

## Hardware validation

1. Build/upload `clashtank.ino` and `ControlSession.h` as a separate UNO R4 WiFi sketch. The ESP32 sketch and header go in a different sketch directory. Never combine the two `.ino` files into one Arduino build.
2. Match broker and topics across web, Python, and firmware. The defaults use `broker.hivemq.com`: WSS `8884/mqtt` for the browser, TCP `1883` for the boards/Python. Existing `.env` overrides these defaults; inspect it before starting the worker.
3. Verify wiring and direction with the wheels raised. ENA=2/ENB=7 are preserved from the original; verify their enable/PWM behavior on the actual UNO R4 wiring.
4. Test every direction, held/released input, center, and rapid direction changes. A held direction should not restart the motor driver on each heartbeat.
5. Test switching modes during a delayed voice response, lock/switch apps, close the tab, interrupt phone internet and board Wi-Fi, then reconnect. Measure time from the last received heartbeat to motor stop. Reconnection must never resume motion automatically.

Offline checks: `npm test`, `python -m unittest discover -s tests -p 'test_*.py'`, `python tests/run_firmware_tests.py`, and `npm run build`. These do not energize hardware.
