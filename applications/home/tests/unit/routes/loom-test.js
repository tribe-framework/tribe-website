import { module, test } from 'qunit';
import { setupTest } from 'home/tests/helpers';

module('Unit | Route | loom', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    let route = this.owner.lookup('route:loom');
    assert.ok(route);
  });
});
