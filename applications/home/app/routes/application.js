import Route from '@ember/routing/route';
import * as bootstrap from 'bootstrap';
import { service } from '@ember/service';
import { later } from '@ember/runloop';
import { action } from '@ember/object';

export default class ApplicationRoute extends Route {
  @service types;

  async beforeModel() {
    await this.types.fetchAgain();
  }

  @action
  didTransition() {
    later(
      this,
      () => {
        document.querySelector('#loading').classList.add('d-none');
      },
      50,
    );
  }

  @action
  willTransition() {
    document.querySelector('#loading').classList.remove('d-none');
  }
}
