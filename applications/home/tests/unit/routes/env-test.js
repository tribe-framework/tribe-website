import { module, test } from 'qunit';
import { setupTest } from 'home/tests/helpers';

module('Unit | Route | env', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    let route = this.owner.lookup('route:env');
    assert.ok(route);
  });
});
