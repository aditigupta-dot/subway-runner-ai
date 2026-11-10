import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import VoiceAssistant from "./VoiceAssistant.jsx";
import { audio } from "./audio.js";
import "./App.css";

const LANES = [-1.7, 0, 1.7];
const TYPES = ["train", "barrier", "overhead"];
const randLane = () => Math.floor(Math.random() * 3);
const randType = () => TYPES[Math.floor(Math.random() * 3)];

const TIPS = [
  "Swipe up to jump barriers",
  "Swipe down to slide under purple bars",
  "Red trains block the lane. Switch lanes!",
  "Say \"jump\" or \"move left\" with voice control",
  "Speed rises as your score grows",
];

/* ---------------------------------------------------------------- loading */

function LoadingScreen({ onStart }) {
  const [progress, setProgress] = useState(0);
  const [tip, setTip] = useState(0);
  const ready = progress >= 100;

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => Math.min(100, p + 2 + Math.random() * 7));
    }, 140);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="sr-loading">
      <div className="sr-loading-sun" />
      <h1 className="sr-loading-title">
        SUBWAY
        <br />
        RUNNER
      </h1>

      <div className="sr-loading-track">
        <div className="sr-loading-runner">🏃</div>
        <div className="sr-loading-train">🚆</div>
      </div>

      {!ready ? (
        <>
          <div className="sr-bar">
            <div className="sr-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="sr-loading-pct">Loading {Math.floor(progress)}%</p>
        </>
      ) : (
        <button className="sr-tap-btn" onClick={onStart}>
          Tap to start
        </button>
      )}
      <p className="sr-loading-tip" key={tip}>
        {ready ? "Sound on for the full ride" : TIPS[tip]}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ scene */

function Sun() {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 2) * 0.03);
    }
  });
  return (
    <group position={[0, 14, -88]}>
      <mesh position={[0, 0, -0.1]}>
        <circleGeometry args={[22, 48]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.35} fog={false} />
      </mesh>
      <mesh ref={ref}>
        <circleGeometry args={[14, 48]} />
        <meshBasicMaterial color="#fb7185" fog={false} />
      </mesh>
    </group>
  );
}

function Track({ running, speed }) {
  const sleepers = useRef([]);

  useFrame((_, delta) => {
    if (!running) return;
    sleepers.current.forEach((mesh) => {
      if (!mesh) return;
      mesh.position.z += speed * delta;
      if (mesh.position.z > 5) mesh.position.z -= 105;
    });
  });

  return (
    <group>
      <mesh position={[0, -0.3, -40]}>
        <boxGeometry args={[10, 0.5, 110]} />
        <meshStandardMaterial color="#2a2346" />
      </mesh>
      {[-2.5, 2.5].map((x) => (
        <mesh key={x} position={[x, 0.08, -40]}>
          <boxGeometry args={[0.15, 0.18, 110]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.7} />
        </mesh>
      ))}
      {Array.from({ length: 42 }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            sleepers.current[i] = el;
          }}
          position={[0, 0, 4 - i * 2.5]}
        >
          <boxGeometry args={[5.2, 0.12, 0.35]} />
          <meshStandardMaterial color="#6b4a3a" />
        </mesh>
      ))}
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} position={[x, 0.015, -40]}>
          <boxGeometry args={[0.035, 0.03, 110]} />
          <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Environment({ running, speed }) {
  const buildings = useRef([]);

  useFrame((_, delta) => {
    if (!running) return;
    buildings.current.forEach((b) => {
      if (!b) return;
      b.position.z += speed * delta * 0.8;
      if (b.position.z > 12) b.position.z -= 108;
    });
  });

  return (
    <group>
      {[-1, 1].map((side) =>
        Array.from({ length: 12 }, (_, i) => (
          <group
            key={`${side}-${i}`}
            ref={(el) => {
              if (el) buildings.current[side === -1 ? i : i + 12] = el;
            }}
            position={[side * 6, 0, -i * 9 - 5]}
          >
            <mesh position={[0, 3 + (i % 3), 0]}>
              <boxGeometry args={[4, 6 + (i % 3) * 2, 5]} />
              <meshStandardMaterial color={i % 2 === 0 ? "#312e81" : "#4c1d95"} />
            </mesh>
            {[0, 1, 2].map((j) => (
              <mesh key={j} position={[side * -2.03, 2 + j * 1.3, 0]}>
                <boxGeometry args={[0.05, 0.6, 0.9]} />
                <meshStandardMaterial
                  color={(i + j) % 2 ? "#fbbf24" : "#22d3ee"}
                  emissive={(i + j) % 2 ? "#f59e0b" : "#0891b2"}
                  emissiveIntensity={0.9}
                />
              </mesh>
            ))}
          </group>
        ))
      )}
    </group>
  );
}

function Player({ lane, jumping, sliding, running }) {
  const player = useRef();
  const leftLeg = useRef();
  const rightLeg = useRef();
  const leftArm = useRef();
  const rightArm = useRef();

  useFrame((state, delta) => {
    if (!player.current) return;
    const p = player.current;
    p.position.x = THREE.MathUtils.damp(p.position.x, LANES[lane], 12, delta);
    const targetY = jumping ? 1.8 + Math.sin(state.clock.elapsedTime * 12) * 0.1 : 0;
    p.position.y = THREE.MathUtils.damp(p.position.y, targetY, 12, delta);
    p.scale.y = THREE.MathUtils.damp(p.scale.y, sliding ? 0.55 : 1, 12, delta);
    // lean into lane changes
    const lean = (LANES[lane] - p.position.x) * -0.25;
    p.rotation.z = THREE.MathUtils.damp(p.rotation.z, lean, 10, delta);

    const m = running ? state.clock.elapsedTime * 14 : 0;
    if (leftLeg.current && rightLeg.current) {
      leftLeg.current.rotation.x = Math.sin(m) * 0.65;
      rightLeg.current.rotation.x = -Math.sin(m) * 0.65;
    }
    if (leftArm.current && rightArm.current) {
      leftArm.current.rotation.x = -Math.sin(m) * 0.55;
      rightArm.current.rotation.x = Math.sin(m) * 0.55;
    }
  });

  return (
    <group ref={player} position={[0, 0, 2]}>
      <RoundedBox args={[0.8, 1.1, 0.5]} radius={0.12} position={[0, 1, 0]}>
        <meshStandardMaterial color="#f97316" />
      </RoundedBox>
      <mesh position={[0, 1.85, 0]}>
        <sphereGeometry args={[0.36, 32, 32]} />
        <meshStandardMaterial color="#f3c6a5" />
      </mesh>
      <mesh position={[0, 2.08, 0]}>
        <sphereGeometry args={[0.35, 32, 16]} />
        <meshStandardMaterial color="#27272a" />
      </mesh>
      {[-0.13, 0.13].map((x) => (
        <mesh key={x} position={[x, 1.87, 0.32]}>
          <sphereGeometry args={[0.035, 16, 16]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
      ))}
      <group ref={leftArm} position={[-0.48, 1.35, 0]}>
        <mesh position={[0, -0.35, 0]}>
          <boxGeometry args={[0.2, 0.7, 0.22]} />
          <meshStandardMaterial color="#f97316" />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.48, 1.35, 0]}>
        <mesh position={[0, -0.35, 0]}>
          <boxGeometry args={[0.2, 0.7, 0.22]} />
          <meshStandardMaterial color="#f97316" />
        </mesh>
      </group>
      <group ref={leftLeg} position={[-0.21, 0.55, 0]}>
        <mesh position={[0, -0.25, 0]}>
          <boxGeometry args={[0.22, 0.55, 0.28]} />
          <meshStandardMaterial color="#2563eb" />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.21, 0.55, 0]}>
        <mesh position={[0, -0.25, 0]}>
          <boxGeometry args={[0.22, 0.55, 0.28]} />
          <meshStandardMaterial color="#2563eb" />
        </mesh>
      </group>
    </group>
  );
}

function Obstacle({ item, register }) {
  return (
    <group ref={register} position={[LANES[item.lane], 0, item.z]}>
      {item.type === "train" ? (
        <>
          <RoundedBox args={[1.35, 2.7, 4]} radius={0.18} position={[0, 1.35, 0]}>
            <meshStandardMaterial color="#dc2626" metalness={0.25} />
          </RoundedBox>
          <mesh position={[0, 2.1, 2.01]}>
            <boxGeometry args={[1.1, 0.45, 0.05]} />
            <meshStandardMaterial color="#7dd3fc" emissive="#0284c7" />
          </mesh>
          <mesh position={[0, 0.3, 2.04]}>
            <boxGeometry args={[1.1, 0.25, 0.05]} />
            <meshStandardMaterial color="#facc15" emissive="#ca8a04" />
          </mesh>
        </>
      ) : item.type === "barrier" ? (
        <group position={[0, 0.55, 0]}>
          <mesh>
            <boxGeometry args={[1.5, 1.1, 0.35]} />
            <meshStandardMaterial color="#f59e0b" />
          </mesh>
          <mesh position={[0, 0.05, 0.19]}>
            <boxGeometry args={[1.4, 0.2, 0.05]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        </group>
      ) : (
        <mesh position={[0, 2.15, 0]}>
          <boxGeometry args={[1.6, 0.35, 0.5]} />
          <meshStandardMaterial color="#a855f7" emissive="#7e22ce" emissiveIntensity={0.5} />
        </mesh>
      )}
    </group>
  );
}

function Coin({ register, position }) {
  return (
    <mesh ref={register} position={position} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.3, 0.09, 12, 24]} />
      <meshStandardMaterial
        color="#facc15"
        emissive="#eab308"
        emissiveIntensity={0.8}
        metalness={0.8}
      />
    </mesh>
  );
}

function GameWorld({ lane, jumping, sliding, running, speed, onHit, onCoin, onDistance }) {
  const obstacleRefs = useRef([]);
  const coinRefs = useRef([]);
  const distance = useRef(0);
  const scoreClock = useRef(0);
  const hitCooldown = useRef(false);

  const obstacles = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        lane: randLane(),
        z: -32 - i * 16,
        type: randType(),
      })),
    []
  );

  // Start positions never change, so re-renders can't snap coins back.
  const coinStart = useMemo(
    () => Array.from({ length: 18 }, (_, i) => [LANES[i % 3], 0.9, -18 - i * 8]),
    []
  );
  const coinLanes = useRef(coinStart.map((_, i) => i % 3));

  // Camera: follows the lane a little and widens the FOV as speed rises.
  useFrame((state, delta) => {
    const cam = state.camera;
    cam.position.x = THREE.MathUtils.damp(cam.position.x, LANES[lane] * 0.45, 4, delta);
    const fov = running ? 60 + (speed - 9.5) * 1.6 : 60;
    cam.fov = THREE.MathUtils.damp(cam.fov, fov, 3, delta);
    cam.updateProjectionMatrix();
    cam.lookAt(cam.position.x * 0.6, 0.5, -3);
  });

  useFrame((state, delta) => {
    if (!running) return;
    const dt = Math.min(delta, 0.05);
    distance.current += dt * speed;
    scoreClock.current += dt;

    if (scoreClock.current >= 0.15) {
      onDistance(Math.floor(distance.current * 2));
      scoreClock.current = 0;
    }

    let hitThisFrame = false;

    obstacleRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.position.z += speed * dt;

      if (mesh.position.z > 7) {
        mesh.position.z = -155 - Math.random() * 25;
        const l = randLane();
        mesh.position.x = LANES[l];
        obstacles[i].lane = l;
        obstacles[i].type = randType();
      }

      const sameLane = obstacles[i].lane === lane;
      const close = Math.abs(mesh.position.z - 2) < 0.9;

      if (sameLane && close && !hitCooldown.current) {
        const type = obstacles[i].type;
        const avoided = (type === "barrier" && jumping) || (type === "overhead" && sliding);
        if (!avoided) {
          hitThisFrame = true;
          mesh.position.z = -170;
        }
      }
    });

    if (hitThisFrame && !hitCooldown.current) {
      hitCooldown.current = true;
      onHit();
    }
    if (!hitThisFrame) hitCooldown.current = false;

    const t = state.clock.elapsedTime;
    coinRefs.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.position.z += speed * dt;
      mesh.position.y = 0.9 + Math.sin(t * 4 + i) * 0.12;
      mesh.rotation.y += dt * 3;

      if (mesh.position.z > 6) {
        mesh.position.z = -155 - Math.random() * 25;
        coinLanes.current[i] = randLane();
        mesh.position.x = LANES[coinLanes.current[i]];
        mesh.visible = true;
      }

      if (
        mesh.visible &&
        coinLanes.current[i] === lane &&
        Math.abs(mesh.position.z - 2) < 0.8
      ) {
        mesh.visible = false;
        onCoin();
      }
    });
  });

  return (
    <>
      <color attach="background" args={["#1b1038"]} />
      <fog attach="fog" args={["#1b1038", 22, 75]} />
      <ambientLight intensity={1.3} />
      <directionalLight position={[5, 12, 8]} intensity={2} color="#ffe4c4" />
      <pointLight position={[0, 5, -10]} intensity={2} color="#f472b6" />

      <Sun />
      <Track running={running} speed={speed} />
      <Environment running={running} speed={speed} />

      {obstacles.map((item, i) => (
        <Obstacle
          key={i}
          item={item}
          register={(el) => {
            obstacleRefs.current[i] = el;
          }}
        />
      ))}

      {coinStart.map((pos, i) => (
        <Coin
          key={i}
          position={pos}
          register={(el) => {
            coinRefs.current[i] = el;
          }}
        />
      ))}

      <Player lane={lane} jumping={jumping} sliding={sliding} running={running} />
    </>
  );
}

/* -------------------------------------------------------------------- app */

export default function App() {
  const [started, setStarted] = useState(false); // loading screen finished
  const [count, setCount] = useState(null); // 3, 2, 1, "GO!" or null
  const [runId, setRunId] = useState(0);
  const [lane, setLane] = useState(1);
  const [jumping, setJumping] = useState(false);
  const [sliding, setSliding] = useState(false);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [shake, setShake] = useState(false);
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [muted, setMuted] = useState(audio.isMuted());
  const [voiceListening, setVoiceListening] = useState(false);
  const [best, setBest] = useState(() => Number(localStorage.getItem("subwayBest") || 0));

  const timers = useRef({});
  const touchStart = useRef(null);

  const speed = 9.5 + Math.min(score / 350, 6);

  function beginRun() {
    clearTimeout(timers.current.jump);
    clearTimeout(timers.current.slide);
    clearInterval(timers.current.count);

    setRunId((n) => n + 1); // fresh world: obstacles and coins reset
    setLane(1);
    setJumping(false);
    setSliding(false);
    setScore(0);
    setCoins(0);
    setGameOver(false);
    setPaused(false);
    setRunning(false);
    audio.duck(false);

    let n = 3;
    setCount(3);
    audio.beep(false);
    timers.current.count = setInterval(() => {
      n -= 1;
      if (n > 0) {
        setCount(n);
        audio.beep(false);
      } else if (n === 0) {
        setCount("GO!");
        audio.beep(true);
      } else {
        clearInterval(timers.current.count);
        setCount(null);
        setRunning(true);
      }
    }, 800);
  }

  // Used by the keyboard, buttons and voice ("start game").
  function startGame() {
    if (!started || count !== null) return;
    beginRun();
  }

  function handleTapToStart() {
    audio.unlock(); // browsers only allow audio after a click
    audio.startMusic();
    setStarted(true);
    beginRun();
  }

  function move(direction) {
    if (!running || gameOver) return false;
    setLane((current) => {
      const next = Math.max(0, Math.min(2, current + direction));
      if (next !== current) audio.swish();
      return next;
    });
    return true;
  }

  function jump() {
    if (!running || jumping || sliding || gameOver) return false;
    setJumping(true);
    audio.jump();
    clearTimeout(timers.current.jump);
    timers.current.jump = setTimeout(() => setJumping(false), 750);
    return true;
  }

  function slide() {
    if (!running || jumping || sliding || gameOver) return false;
    setSliding(true);
    audio.slide();
    clearTimeout(timers.current.slide);
    timers.current.slide = setTimeout(() => setSliding(false), 800);
    return true;
  }

  function handleHit() {
    setRunning(false);
    setGameOver(true);
    setVoiceListening(false);
    setShake(true);
    clearTimeout(timers.current.shake);
    timers.current.shake = setTimeout(() => setShake(false), 600);
    audio.crash();
    audio.duck(true);

    setBest((old) => {
      const next = Math.max(old, score);
      localStorage.setItem("subwayBest", String(next));
      return next;
    });
  }

  function pauseGame() {
    if (!running) return;
    setRunning(false);
    setPaused(true);
    audio.duck(true);
  }

  function resumeGame() {
    if (!paused || gameOver) return;
    setPaused(false);
    setRunning(true);
    audio.duck(false);
  }

  function toggleMute() {
    const next = !muted;
    audio.setMuted(next);
    setMuted(next);
  }

  useEffect(() => {
    function handleKey(e) {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) {
        e.preventDefault();
      }
      if (!started) return;
      const k = e.key.toLowerCase();

      if (k === "m") return toggleMute();
      if (e.key === "Escape") return running ? pauseGame() : resumeGame();
      if (e.key === "Enter") {
        if (gameOver) startGame();
        else if (paused) resumeGame();
        return;
      }
      if (!running) return;

      if (e.key === "ArrowLeft" || k === "a") move(-1);
      if (e.key === "ArrowRight" || k === "d") move(1);
      if (e.key === "ArrowUp" || k === "w" || e.key === " ") jump();
      if (e.key === "ArrowDown" || k === "s") slide();
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  useEffect(() => {
    const t = timers.current;
    return () => {
      Object.values(t).forEach((id) => {
        clearTimeout(id);
        clearInterval(id);
      });
      audio.stopMusic();
    };
  }, []);

  function handleTouchStart(e) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }

  function handleTouchEnd(e) {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 30) move(1);
      if (dx < -30) move(-1);
    } else {
      if (dy < -30) jump();
      if (dy > 30) slide();
    }
    touchStart.current = null;
  }

  const speedLevel = Math.min(1, (speed - 9.5) / 6);

  return (
    <main className="sr-game">
      <header className="sr-topbar">
        <div className="sr-logo">SUBWAY RUNNER</div>
        <div className="sr-status">
          {running
            ? voiceListening
              ? "● Listening"
              : "● Live"
            : gameOver
            ? "Game over"
            : paused
            ? "Paused"
            : "Get ready"}
        </div>
        <button className="sr-icon-btn" onClick={toggleMute} title="Mute (M)">
          {muted ? "🔇" : "🔊"}
        </button>
      </header>

      <section
        className={`sr-game-area ${shake ? "sr-shake" : ""}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <Canvas
          camera={{ position: [0, 5, 11], fov: 60 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true }}
        >
          <GameWorld
            key={runId}
            lane={lane}
            jumping={jumping}
            sliding={sliding}
            running={running}
            speed={speed}
            onHit={handleHit}
            onCoin={() => {
              audio.coin();
              setCoins((c) => c + 1);
            }}
            onDistance={setScore}
          />
        </Canvas>

        <div className="sr-speedlines" style={{ opacity: running ? 0.25 + speedLevel * 0.6 : 0 }} />
        {gameOver && <div className="sr-crash-flash" />}

        <VoiceAssistant
          onMove={move}
          onJump={jump}
          onSlide={slide}
          onStart={startGame}
          onPause={pauseGame}
          onResume={resumeGame}
          onListeningChange={setVoiceListening}
        />

        <div className="sr-stats">
          <div className="sr-stat">
            <span>Score</span>
            <strong>{String(score).padStart(6, "0")}</strong>
          </div>
          <div className="sr-stat">
            <span>Coins</span>
            <strong key={coins} className="sr-pop">
              🪙 {coins}
            </strong>
          </div>
          <div className="sr-stat">
            <span>Speed</span>
            <strong>{speed.toFixed(1)}</strong>
          </div>
          <div className="sr-stat">
            <span>Best</span>
            <strong>{best}</strong>
          </div>
        </div>

        {count !== null && (
          <div className="sr-countdown" key={String(count)}>
            {count}
          </div>
        )}

        {paused && (
          <div className="sr-overlay">
            <div className="sr-dialog">
              <h2>Paused</h2>
              <button className="sr-primary-btn" onClick={resumeGame}>
                Resume
              </button>
              <small>Press Esc to resume</small>
            </div>
          </div>
        )}

        {gameOver && (
          <div className="sr-overlay">
            <div className="sr-dialog">
              <h2>Busted!</h2>
              <div className="sr-result">
                <div>
                  <span>Score</span>
                  <strong>{score}</strong>
                </div>
                <div>
                  <span>Coins</span>
                  <strong>{coins}</strong>
                </div>
                <div>
                  <span>Best</span>
                  <strong>{best}</strong>
                </div>
              </div>
              <button className="sr-primary-btn" onClick={startGame}>
                Run again
              </button>
              <small>Press Enter to restart</small>
            </div>
          </div>
        )}

        {running && (
          <button className="sr-pause-btn" onClick={pauseGame} title="Pause">
            Ⅱ
          </button>
        )}

        <div className="sr-controls">
          <button onClick={() => move(-1)} disabled={!running}>
            ←
          </button>
          <button onClick={jump} disabled={!running}>
            ↑ Jump
          </button>
          <button onClick={slide} disabled={!running}>
            ↓ Slide
          </button>
          <button onClick={() => move(1)} disabled={!running}>
            →
          </button>
        </div>
      </section>

      <footer className="sr-bottom">
        <span>← → move</span>
        <span>↑ jump</span>
        <span>↓ slide</span>
        <span>Esc pause</span>
        <span>M mute</span>
      </footer>

      {!started && <LoadingScreen onStart={handleTapToStart} />}
    </main>
  );
}