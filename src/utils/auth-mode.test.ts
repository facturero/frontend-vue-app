import { describe, expect, it } from 'vitest';
import { initialAuthMode, prefilledCredentials } from './auth-mode';

describe('initialAuthMode', () => {
  it('?mode=register abre «Crear cuenta»', () => {
    expect(initialAuthMode({ mode: 'register' })).toBe('register');
  });

  it('sin parámetro, o con cualquier otro valor, es el login', () => {
    expect(initialAuthMode({})).toBe('login');
    expect(initialAuthMode({ mode: 'login' })).toBe('login');
    expect(initialAuthMode({ mode: 'admin' })).toBe('login');
    expect(initialAuthMode({ mode: ['otra', 'register'] })).toBe('login');
  });

  it('si el parámetro viene repetido, manda el primero', () => {
    expect(initialAuthMode({ mode: ['register', 'login'] })).toBe('register');
  });
});

describe('prefilledCredentials', () => {
  it('en producción el formulario sale vacío', () => {
    expect(prefilledCredentials(false, 'login')).toEqual({ email: '', password: '' });
  });

  it('crear una cuenta nunca sale con las credenciales de desarrollo, ni en desarrollo', () => {
    expect(prefilledCredentials(true, 'register')).toEqual({ email: '', password: '' });
  });

  it('solo el login de desarrollo las trae', () => {
    expect(prefilledCredentials(true, 'login')).toEqual({ email: 'admin@admin.com', password: 'admin' });
  });
});
