import { Routes } from '@angular/router';
import { adminGuard, authGuard, createGuard, modifyGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () => import('./shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      { path: 'captura', canActivate: [createGuard], loadComponent: () => import('./pages/captura.component').then((m) => m.CapturaComponent) },
      { path: 'captura/:key', canActivate: [modifyGuard], loadComponent: () => import('./pages/captura.component').then((m) => m.CapturaComponent) },
      { path: 'panel', loadComponent: () => import('./pages/panel.component').then((m) => m.PanelComponent) },
      { path: 'registros', loadComponent: () => import('./pages/registros.component').then((m) => m.RegistrosComponent) },
      { path: 'informe', loadComponent: () => import('./pages/informe.component').then((m) => m.InformeComponent) },
      { path: 'usuarios', canActivate: [adminGuard], loadComponent: () => import('./pages/usuarios.component').then((m) => m.UsuariosComponent) },
      { path: 'ajustes', loadComponent: () => import('./pages/ajustes.component').then((m) => m.AjustesComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'captura' },
    ],
  },
  { path: '**', redirectTo: '' },
];
