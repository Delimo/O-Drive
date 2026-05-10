import { adminState } from './admin-state.js';
import { AdminActions } from './admin-actions.js';
import { api } from './api.js';

window.AdminActions = AdminActions;

const startYear = 2026;
const currentYear = new Date().getFullYear();
const yearDisp = document.getElementById('year-display');
if (yearDisp) yearDisp.textContent = currentYear > startYear ? `${startYear} - ${currentYear}` : startYear;

await api.getRole();
AdminActions.loadLogs();
