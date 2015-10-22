'use strict';
var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;
var yeoman = require('yeoman-generator');
var _s = require('underscore.string');
var mkdirp = require('mkdirp');
var chromeManifest = require('./chrome-manifest');

module.exports = yeoman.generators.Base.extend({
  constructor: function (args, options, config) {
    var testLocal;

    yeoman.generators.Base.apply(this, arguments);

    // preapre options
    this.option('test-framework', {
      desc: 'Test framework to be invoked',
      type: String,
      defaults: 'mocha'
    });

    this.option('babel', {
      type: Boolean,
      defaults: true,
      desc: 'Compile ES2015 using Babel'
    });

    this.option('compass', {
      desc: 'Use Compass',
      type: Boolean,
      defaults: false
    });

    // load package
    this.pkg = require('../package.json');

    // set source root path to templates
    this.sourceRoot(path.join(__dirname, 'templates'));

    // set local data with appname
    this.locale = {
      name: this.appname,
      description: ''
    };

    this.srcScript = 'app/scripts' + (this.options.babel ? '.babel/' : '/');

    if (this.options['test-framework'] === 'mocha') {
      testLocal = require.resolve('generator-mocha/generators/app/index.js');
    } else if (this.options['test-framework'] === 'jasmine') {
      testLocal = require.resolve('generator-jasmine/generators/app/index.js');
    }

    this.composeWith(this.options['test-framework'] + ':app', {
      options: {
        'skip-install': this.options['skip-install']
      }
    }, {
      local: testLocal
    });

    // copy source files to scripts or scripts.babel
    this.copyjs = function copyjs(src, dest) {
      if (!dest) {
        dest = src;
      }

      this.fs.copyTpl(
        this.templatePath('scripts/' + src),
        this.destinationPath(this.srcScript + dest),
        {
          babel: this.options.babel
        }
      );
    };
  },

  askFor: function (argument) {
    var cb = this.async();

    var prompts = [
      {
        name: 'name',
        message: 'What would you like to call this extension?',
        default: (this.appname) ? this.appname : 'myChromeApp'
      },
      {
        name: 'description',
        message: 'How would you like to describe this extension?',
        default: 'My Chrome Extension'
      },
      {
        type: 'list',
        name: 'uiAction',
        message: 'Would you like to use UI Action?',
        choices: chromeManifest.uiActionChoices
      },
      {
        type: 'checkbox',
        name: 'uiFeatures',
        message: 'Would you like more UI Features?',
        choices: chromeManifest.uiFeatureChoices
      },
      {
        type: 'checkbox',
        name: 'permissions',
        message: 'Would you like to set permissions?',
        choices: chromeManifest.permissionChoices
      }
    ];

    this.prompt( prompts , function(answers) {
      var isChecked = function (choices, value) {
        return choices.indexOf(value) > -1;
      };

      // store information for app
      this.appname = this.locale.name = answers.name.replace(/\"/g, '\\"');
      this.locale.description = answers.description;

      // prepare options
      this.options.uiAction = answers.uiAction === 'No' ? 0 : (answers.uiAction === 'browserAction') ? 1 : 2;
      this.options.optionsUI = isChecked(answers.uiFeatures, 'optionsUI');
      this.options.contentscript = isChecked(answers.uiFeatures, 'contentScripts');

      // create manifest with basic field
      this.manifest = chromeManifest.createManifest({
        fields: ((this.options.uiAction > 0 ? [answers.uiAction] : [])).concat(answers.uiFeatures),
        permissions: answers.permissions
      });

      cb();
    }.bind(this));
  },

  app: function () {
    mkdirp('app');
    mkdirp('app/bower_components');
  },

  gruntfile: function () {
    this.fs.copyTpl(
      this.templatePath('Gruntfile.js'),
      this.destinationPath('Gruntfile.js'),
      {
        name: this.appname,
        pkg: this.pkg,
        uiAction: this.options.uiAction > 0,
        babel: this.options.babel,
        testFramework: this.options['test-framework'],
        compass: this.options.compass
      }
    );
  },

  packageJSON: function () {
    this.fs.copyTpl(
      this.templatePath('_package.json'),
      this.destinationPath('package.json'),
      {
        name: _s.slugify(this.appname),
        babel: this.options.babel,
        testFramework: this.options['test-framework'],
        compass: this.options.compass
      }
    );
  },

  git: function () {
    this.fs.copyTpl(
      this.templatePath('gitignore'),
      this.destinationPath('.gitignore'),
      {
        babel: this.options.babel
      }
    );

    this.fs.copy(
      this.templatePath('gitattributes'),
      this.destinationPath('.gitattributes')
    );
  },

  bower: function () {
    this.copy('bowerrc', '.bowerrc');
    this.fs.copyTpl(
      this.templatePath('_bower.json'),
      this.destinationPath('bower.json'),
      {
        name: _s.slugify(this.appname)
      }
    );
  },

  jshint: function () {
    this.fs.copyTpl(
      this.templatePath('jshintrc'),
      this.destinationPath('.jshintrc'),
      {
        testFramework: this.options['test-framework']
      }
    );
  },

  editorConfig: function () {
    this.fs.copy(
      this.templatePath('editorconfig'),
      this.destinationPath('.editorconfig')
    );
  },

  manifest: function () {
    // change title for popup
    if (this.options.uiAction > 0) {
      var uiAction = this.manifest[(this.options.uiAction === 1) ? 'browser_action' : 'page_action'];
      uiAction.default_title = this.appname;
      uiAction.default_popup = 'popup.html';
    }

    // add omnibox keyword field.
    if (this.options.omnibox) {
      this.manifest.omnibox.keyword = this.manifest.name;
    }

    this.fs.writeJSON(this.destinationPath('app/manifest.json'), this.manifest);
  },

  actions: function () {
    if (!this.options.uiAction) {
      return;
    }

    this.fs.copy(
      this.templatePath('popup.html'),
      this.destinationPath('app/popup.html')
    );

    this.copyjs('popup.js');

    this.fs.copy(
      this.templatePath('images/icon-19.png'),
      this.destinationPath('app/images/icon-19.png')
    );

    this.fs.copy(
      this.templatePath('images/icon-38.png'),
      this.destinationPath('app/images/icon-38.png')
    );
  },

  eventpage: function () {
    var backgroundjs = 'background.js';

    if (this.options.uiAction === 2) {
      backgroundjs = 'background.pageaction.js';
    } else if (this.options.uiAction === 1) {
      backgroundjs = 'background.browseraction.js';
    }

    this.copyjs(backgroundjs, 'background.js');
    this.copyjs('chromereload.js');
  },

  optionsUI: function () {
    if (!this.options.optionsUI) {
      return;
    }

    this.fs.copy(
      this.templatePath('options.html'),
      this.destinationPath('app/options.html')
    );

    this.copyjs('options.js');
  },

  contentscript: function () {
    if (!this.options.contentscript) {
      return;
    }

    this.copyjs('contentscript.js');
  },

  babel: function () {
    if (!this.options.babel) {
      return;
    }

    this.fs.copy(
      this.templatePath('babelrc'),
      this.destinationPath('.babelrc')
    );
  },

  mainStylesheet: function () {
    if (!this.options.uiAction && !this.options.optionsUI) {
      return;
    }

    var css = 'styles/main.' + (this.compass ? 's' : '') + 'css';

    this.fs.copy(
      this.templatePath(css),
      this.destinationPath('app/' + css)
    );
  },

  assets: function () {
    this.fs.copyTpl(
      this.templatePath('_locales/en/messages.json'),
      this.destinationPath('app/_locales/en/messages.json'),
      this.locale
    );

    this.fs.copy(
      this.templatePath('images/icon-16.png'),
      this.destinationPath('app/images/icon-16.png')
    );

    this.fs.copy(
      this.templatePath('images/icon-128.png'),
      this.destinationPath('app/images/icon-128.png')
    );
  },

  install: function () {
    if (!this.options['skip-install']) {
      this.installDependencies({
        skipMessage: this.options['skip-install-message'],
        skipInstall: this.options['skip-install']
      });
    }
  }
});
