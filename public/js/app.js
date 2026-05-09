import { state } from './state.js';
import { UI, Message } from './ui.js';
import { Actions } from './actions.js';

window.state = state;
window.UI = UI;
window.Message = Message;
window.Actions = Actions;

Actions.init();
