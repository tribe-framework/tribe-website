import EmberRouter from '@ember/routing/router';
import config from 'home/config/environment';

export default class Router extends EmberRouter {
  location = config.locationType;
  rootURL = config.rootURL;
}

Router.map(function () {
  this.route('prerequisites');
  this.route('frontend');
  this.route('backend');
  this.route('loom');
  this.route('tor');
  this.route('structure');
  this.route('ai');
  this.route('ubuntu');
  this.route('vhost');
});
