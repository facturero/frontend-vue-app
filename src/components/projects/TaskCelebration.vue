<script setup lang="ts">
import { ref, watch } from 'vue';
import { useCelebration } from '@/composable/useCelebration';

/**
 * Estallido breve de confeti al completar una tarea (ver `useCelebration`). Los colores son tokens del tema, así funciona igual en
 * claro y en oscuro. No intercepta clics: se puede seguir trabajando mientras se ve.
 */
const { tick } = useCelebration();
const COLORS = ['primary', 'secondary', 'success', 'warning', 'info', 'error'];

interface Piece {
  id: number;
  color: string;
  dx: number;
  dy: number;
  rotate: number;
  delay: number;
}

const bursts = ref<Array<{ id: number; pieces: Piece[] }>>([]);
let seq = 0;

watch(tick, () => {
  const id = ++seq;
  const pieces = Array.from({ length: 28 }, (_, i) => {
    const angle = (Math.PI * 2 * i) / 28 + Math.random() * 0.4;
    const distance = 90 + Math.random() * 110;
    return {
      id: i,
      color: COLORS[i % COLORS.length]!,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 60,
      rotate: Math.random() * 720 - 360,
      delay: Math.random() * 80,
    };
  });
  bursts.value.push({ id, pieces });
  setTimeout(() => {
    bursts.value = bursts.value.filter((b) => b.id !== id);
  }, 1400);
});
</script>

<template>
  <div class="celebration" aria-hidden="true">
    <div v-for="burst in bursts" :key="burst.id" class="celebration__burst">
      <span
        v-for="p in burst.pieces"
        :key="p.id"
        class="celebration__piece"
        :style="{
          background: `rgb(var(--v-theme-${p.color}))`,
          '--dx': `${p.dx}px`,
          '--dy': `${p.dy}px`,
          '--rot': `${p.rotate}deg`,
          animationDelay: `${p.delay}ms`,
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.celebration {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 3000;
}
.celebration__burst {
  position: absolute;
  left: 50%;
  bottom: 30%;
}
.celebration__piece {
  position: absolute;
  width: 8px;
  height: 12px;
  border-radius: 2px;
  opacity: 0;
  animation: celebration-fly 1.2s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
}
@keyframes celebration-fly {
  0% {
    transform: translate(0, 0) rotate(0);
    opacity: 1;
  }
  80% {
    opacity: 1;
  }
  100% {
    transform: translate(var(--dx), calc(var(--dy) + 140px)) rotate(var(--rot));
    opacity: 0;
  }
}
</style>
