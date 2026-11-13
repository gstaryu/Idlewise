import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

const aliases = {
  '@': resolve(__dirname, '.'),
  '@/app': resolve(__dirname, 'app'),
  '@/lib': resolve(__dirname, 'lib'),
  '@/resources': resolve(__dirname, 'resources'),
}

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    globals: true,
  },
  resolve: { alias: aliases },
})
