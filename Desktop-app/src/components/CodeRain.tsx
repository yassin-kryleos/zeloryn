import React, { useEffect, useRef } from 'react';

interface CodeRainProps {
  opacity?: number;
}

export const CodeRain: React.FC<CodeRainProps> = ({ opacity = 0.15 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Make canvas full screen
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Characters used for the ambient code-rain background.
    const katakana = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const alphabet = katakana.split('');

    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize) + 1;

    // Drop tracking array (y coordinate for each column)
    const rainDrops: number[] = [];
    for (let x = 0; x < columns; x++) {
      rainDrops[x] = Math.floor(Math.random() * -100); // Start offscreen above
    }

    const draw = () => {
      // Clear with slight opacity to create trails
      ctx.fillStyle = `rgba(4, 8, 5, ${opacity})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#00ff66';
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < rainDrops.length; i++) {
        // Pick random character
        const text = alphabet[Math.floor(Math.random() * alphabet.length)];
        
        // Draw the character
        const x = i * fontSize;
        const y = rainDrops[i] * fontSize;

        // Draw first char as white/brightest sometimes
        if (Math.random() > 0.98) {
          ctx.fillStyle = '#ffffff';
        } else {
          ctx.fillStyle = '#00ff66';
        }

        ctx.fillText(text, x, y);

        // Reset drops back to top after reaching bottom with random offset
        if (y > canvas.height && Math.random() > 0.975) {
          rainDrops[i] = 0;
        }

        rainDrops[i]++;
      }
    };

    let animationId: number;
    const interval = 30; // ms
    let lastTime = 0;

    const animate = (time: number) => {
      if (time - lastTime >= interval) {
        draw();
        lastTime = time;
      }
      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [opacity]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  );
};
