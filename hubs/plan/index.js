// Plan hub: calendar agenda (today plus the next 7 days) and key dates.
import { renderAgenda } from '../../core/calendar.js';

export default {
  id: 'plan',
  title: 'Plan',
  async render(container) {
    container.innerHTML = `
      <div class="card"><h2 class="card-title">Next 7 days</h2><div id="plan-agenda"></div></div>
      <div id="plan-keydates"></div>`;
    await renderAgenda(container.querySelector('#plan-agenda'), 8);
  },
};
