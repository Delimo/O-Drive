export const Message = {
  show(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = `toast-anim px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg flex items-center gap-2 pointer-events-auto transition-opacity duration-300 ${type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-primary'} text-white my-1`;
    const icon = document.createElement('span');
    icon.textContent = type === 'success' ? 'OK' : '!';
    div.appendChild(icon);
    div.appendChild(document.createTextNode(` ${msg}`));
    container.appendChild(div);
    setTimeout(() => {
      div.classList.add('opacity-0');
      setTimeout(() => div.remove(), 300);
    }, 3000);
  },
  success(msg) {
    this.show(msg, 'success');
  },
  error(msg) {
    this.show(msg, 'error');
  },
};
