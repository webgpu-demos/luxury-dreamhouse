// DOM overlay: title card, character chip, interaction prompt, zone banner, toasts, treasure counter, help.
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = { prompt: $('prompt'), toast: $('toast'), zone: $('zone'), who: $('who'), role: $('role'), chests: $('chests'), help: $('help'), fade: $('fade'), title: $('title'), hud: $('hud') };
    this._toastT = 0; this._zoneT = 0;
  }
  setCharacter(name, role) { this.el.who.textContent = name; this.el.role.textContent = role; }
  prompt(text) {
    if (text === this._p) return;
    this._p = text;
    this.el.prompt.innerHTML = text ? text.replace(/^E  /, '<kbd>E</kbd> ') : '';
    this.el.prompt.classList.toggle('on', !!text);
  }
  toast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.el.toast.classList.remove('on'), 3200);
  }
  zone(name) {
    this.el.zone.textContent = name;
    this.el.zone.classList.add('on');
    clearTimeout(this._zoneT);
    this._zoneT = setTimeout(() => this.el.zone.classList.remove('on'), 2600);
  }
  setChests(n, total) { this.el.chests.textContent = `${n} / ${total}`; }
  toggleHelp(force) { this.el.help.classList.toggle('on', force); }
  fade(mid) {
    this.el.fade.classList.add('on');
    setTimeout(() => { mid && mid(); setTimeout(() => this.el.fade.classList.remove('on'), 350); }, 650);
  }
  showTitle(on) { this.el.title.classList.toggle('gone', !on); this.el.hud.classList.toggle('on', !on); }
}
