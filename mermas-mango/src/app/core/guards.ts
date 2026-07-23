import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? true : router.parseUrl('/login');
};

/** Crear merma: admin y capturista. */
export const createGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.canCreate() ? true : router.parseUrl('/panel');
};

/** Editar/borrar merma: solo admin. */
export const modifyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.canModify() ? true : router.parseUrl('/registros');
};

/** Gestion de usuarios: solo admin. */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.canUsers() ? true : router.parseUrl('/panel');
};

/** Edicion de catalogos (variedades / caracteristicas): hoy solo admin. */
export const catalogosGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.canCatalogos() ? true : router.parseUrl('/panel');
};
