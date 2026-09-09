import { module, test } from 'qunit';
import { setupTest } from 'home/tests/helpers';

module('Unit | Route | markdown-editor', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    let route = this.owner.lookup('route:markdown-editor');
    assert.ok(route);
  });
});
