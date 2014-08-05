var kGRID = 20;

var stateManager = null;

function decodeFilePath(filePath) {
  return filePath.replace(/\|/g, '/');
}

function encodeFilePath(filePath) {
  return filePath.replace(/\//g, '|');
}

var fs = {
  get: function(filePath, type) {
    // The following should be the same as wrapping the entire `$.get` in
    // a `Promise.resolve(...)`, however, it does not :/ Doing it therefore
    // this way, which is ugly, but it works :)
    return new Promise(function(resolve, reject) {
      $.get('fs/' + encodeFilePath(filePath), function() {
        console.log('success');
      }, type || 'text').done(resolve).fail(reject);
    });

  },

  set: function(filePath, content) {
    return Promise.resolve(
        $.post('fs/' + encodeFilePath(filePath), content));
  }
}

function StateManager(stateFilePath) {
  this.stateFilePath = stateFilePath;
  this.views = [];
  this.allowSave = true;
  this.appliesStateFile = true;

  if (!stateFilePath) {
    var lastState = localStorage.getItem('lastState');
    if (lastState && lastState.stateFilePath) {
      // Set the `stateFilePath` variable here if there is none passed to the
      this.stateFilePath = stateFilePath = lastState.stateFilePath;
    } else if (lastState) {
      this.applyState(JSON.parse(lastState));
      return;
    }
  }

  if (stateFilePath) {
    var self = this;
    fs.get(stateFilePath).then(function(content) {
      self.applyState(JSON.parse(content));
      self.appliesStateFile = false;
    }, function(error) {
      alert('Could not load the state file. Sure there is one?');
      this.appliesStateFile = false;
    });
  } else {
    this.appliesStateFile = false;
  }
}

StateManager.prototype.addView = function(view) {
  if (this.appliesStateFile) return;

  this.views.push(view);
  this.save();
}

StateManager.prototype.removeView = function(view) {
  this.views.splice(this.views.indexOf(view), 1);
  this.save();
}

StateManager.prototype.setStateFilePath = function(stateFilePath) {
  this.stateFilePath = stateFilePath;
}

StateManager.prototype.applyState = function(state) {
  this.stateFilePath = state.stateFilePath;
  this.views = state.views.map(function(viewState) {
    var editorContainer = document.getElementById('editorContainer');
    if (viewState.type == 'EditorView') {
      return new EditorView(editorContainer, viewState);
    } else if (viewState.type == 'SearchView') {
      return new SearchView(editorContainer, viewState);
    }
  });
}

StateManager.prototype.close = function() {
  this.save();
  this.allowSave = false;
  this.views.forEach(function(view) {
    view.close();
  });
}

StateManager.prototype.save = function() {
  if (!this.allowSave) return;
  if (this.appliesStateFile) return;

  var state = JSON.stringify({
    stateFilePath: this.stateFilePath,
    views: _.compact(this.views.map(function(view) {
      return view.getState();
    }))
  }, null, 2);
  localStorage.setItem('lastState', state);
  if (this.stateFilePath) {
    fs.set(this.stateFilePath, state);
  }
}

var docManager = new DocManager();

function DocManager() {
  this.docs = {};
  this.fileExtensionModeMap = {
    js: 'javascript',
    rs: 'rust',
    html: 'htmlmixed',
    xml: 'xml',
    css: 'css'
  }
}

DocManager.prototype.get = function(filePath, options) {
  var self = this;
  var docs = this.docs;

  var promise = new Promise(function(resolve, reject) {
    if (!docs[filePath]) {

      // Create a new root-doc-promise for this filePath.
      docs[filePath] = new Promise(function(resolve, reject) {

        // Request the fiel content.
        fs.get(filePath).then(function(content) {
          var fileEnding = filePath.substring(filePath.lastIndexOf('.') + 1);
          var fileMode = self.fileExtensionModeMap[fileEnding] || '';
          // Once the file content is there, create a new CodeMirror document
          // object and resolve the root-doc-promise.
          resolve(new CodeMirror.Doc(content, fileMode));
        }, reject);
      })
    }

    docs[filePath].then(function(doc) {
      var linkedDoc = doc.linkedDoc(options);
      linkedDoc.filePath = filePath;
      resolve(linkedDoc);
    }, reject);
  });
  return promise;
}

DocManager.prototype.saveAll = function() {
  Object.keys(this.docs).forEach(function(filePath) {
    var docPromise = this.docs[filePath];
    docPromise.then(function(rootDoc) {
      fs.set(filePath, rootDoc.getValue());
    });
  }, this)
}

var mixin = function(a, b) {
  for (var name in b) {
    if (b.hasOwnProperty(name)) {
      a[name] = b[name];
    }
  }
  return a;
}

var DraggableMixin = {
  initDraggable: function(onResize) {
    $(this.dom).
      draggable({ grid: [ kGRID, kGRID ] }).
      resizable({
        grid: kGRID,
        resize: function(event, ui) {
          if (onResize) onResize();
        }
      });
  },

  getStateDraggable: function(state) {
    var dom = this.dom;
    state.top = dom.style.top;
    state.left = dom.style.left;
    state.width = dom.style.width;
    state.height = dom.style.height;
  },

  setStateDraggable: function(state) {
    var dom = this.dom;
    dom.style.top = state.top;
    dom.style.left = state.left;
    dom.style.width = state.width;
    dom.style.height = state.height;
  }
};

function SearchView(parentDom, state) {
  var self = this;
  this.parentDom = parentDom;

  var dom = this.dom = document.createElement('div');
  dom.setAttribute('class', 'searchUI-view ui-widget-content draggable');

  var domTemplate = document.getElementById('searchUI-template');
  dom.innerHTML = domTemplate.textContent;

  var editorDom = dom.querySelector('.searchUI-editor');
  var editor = this.editor = CodeMirror(editorDom, {
    extraKeys: {
      "Cmd-D": function(cm) {
        self.close();
      }
    }
  });

  var cmdInput = this.cmdInput = dom.querySelector('.searchUI-cmd');
  var queryInput = this.queryInput = dom.querySelector('.searchUI-search');
  queryInput.addEventListener('keydown', function(evt) {
    if (evt.keyCode == 13) {
      self.exec();
    }
  });

  this.initDraggable();

  this.setState(state || this.getDefaultState());

  stateManager.addView(this);
  parentDom.appendChild(dom);
}

mixin(SearchView.prototype, DraggableMixin);

SearchView.prototype.exec = function() {
  var options = {};
  var query = this.queryInput.value;
  var cmdRaw = this.cmdInput.value;
  var cwd = cmdRaw.split('@')[1];
  var cmd = cmdRaw.split('@')[0].trim().replace('$0', query);

  if (cwd) options.cwd = cwd.trim();

  var self = this;
  this.editor.setValue('Executing...');
  $.post('/exec', JSON.stringify({
    cmd: cmd,
    options: options
  }), function(content) {
    self.editor.setValue(content);
  });
}

SearchView.prototype.getDefaultState = function() {
  var res = { type: 'SearchView' };

  this.getStateDraggable(res);
  res.cmd = 'ag -A 3 -B 3  -i $0 @ ' + stateManager.stateFilePath;
  res.query = 'HelloWorld';
  return res;
}

SearchView.prototype.getState = function() {
  var res = this.getDefaultState();
  res.cmd = this.cmdInput.value;
  res.query = this.queryInput.value;
  return res;
}

SearchView.prototype.setState = function(state) {
  this.setStateDraggable(state);
  this.cmdInput.value = state.cmd;
  this.queryInput.value = state.query;
}

SearchView.prototype.close = function() {
  this.parentDom.removeChild(this.dom);
  stateManager.removeView(this);
}

function EditorView(parentDom, state) {
  var self = this;
  this.parentDom = parentDom;

  var dom = this.dom = document.createElement('div');
  dom.setAttribute('class', 'draggable ui-widget-content editor-view');

  var editorDom = this.editorDom = document.createElement('div');
  editorDom.setAttribute('class', 'editor-container');

  dom.appendChild(editorDom);
  parentDom.appendChild(dom);

  dom.addEventListener('dblclick', function(ev) {
    ev.stopPropagation();
  })

  var editor = this.editor = CodeMirror(editorDom, {
    lineWrapping: false,
    fixedGutter: true,
    lineNumbers: true,
    indentWithTabs: false,
    rulers: [{color: '#ddd', column: 80, lineStyle: 'dashed'}],
    extraKeys: {
      "Cmd-D": function(cm) {
        self.close();
      },

      "Cmd-S": function(cm) {
        docManager.saveAll();
        stateManager.save();
      },

      "Ctrl-F": function(cm) {
        createNewView(null, editor.getDoc().filePath);
      },

      "Shift-Cmd-F": function(cm) {
        new SearchView(parentDom);
      },

      "Ctrl-L": function(cm) {
        var selections = editor.listSelections();
        if (selections.length == 0) {
          alert('Please select a chunk of lines.');
          return;
        }
        var from = selections[0].head.line;
        var to = selections[0].anchor.line;
        if (to < from) {
          var t = to; to = from; from = t;
        }

        self.fileOptions = {from: from, to: to};

        var linkedDoc = editor.getDoc().linkedDoc({from: from, to:to});
        linkedDoc.filePath = editor.getDoc().filePath;
        editor.swapDoc(linkedDoc);
      }
    }
  });

  if (state) this.setState(state);

    // Init the mixins.
  this.initDraggable(this.layout.bind(this) /* onResize */);

  stateManager.addView(this);
}

mixin(EditorView.prototype, DraggableMixin);

EditorView.prototype.layout = function() {
  this.editor.refresh();
}

EditorView.prototype.focus = function() {
  this.editor.focus();
}

EditorView.prototype.close = function() {
  this.parentDom.removeChild(this.dom);
  stateManager.removeView(this);
}

EditorView.prototype.getFilePath = function() {
  return this.editor.getDoc().filePath;
}

EditorView.prototype.getState = function() {
  var filePath = this.getFilePath();

  if (!filePath) {
   	return;
  }

  var res = { type: 'EditorView' };
  var scrollInfo = this.editor.getScrollInfo();
  var dom = this.dom;

  this.getStateDraggable(res);
  res.fileOptions = this.fileOptions;
  res.filePath = filePath;
  res.scrollX = scrollInfo.left;
  res.scrollY = scrollInfo.top;
  return res;
}

EditorView.prototype.showFile = function(filePath, options) {
  var self = this;
  return docManager.get(filePath, options).then(function(doc) {
    self.editor.swapDoc(doc);
  }, function() {
    self.editor.setValue('Failed to get the file. Closing view again.')
  });
}

EditorView.prototype.setState = function(state) {
  var self = this;
  var dom = this.dom;

  this.setStateDraggable(state);

  this.fileOptions = state.fileOptions;
  this.showFile(state.filePath, state.fileOptions).then(function() {
    // Set the scroll position only after the file is loaded, such that the
    // scrollIntoView will apply to the loaded file.
    self.editor.scrollTo(state.scrollX, state.scrollY);
  });
}

function createNewView(ev, filePath, state) {
  if (state) filePath = state.filePath;

  if (!filePath) {
    filePath = prompt(
        'Which file should be opened? Please insert the file path:',
        '/Users/jviereck/develop/vedit/server.js');
  }

  if (!filePath) return;

  var editorContainer = document.getElementById('editorContainer');
  var view = new EditorView(editorContainer);

  if (ev) {
    view.dom.style.left = Math.floor(ev.offsetX / kGRID) * kGRID + 'px';
    view.dom.style.top = Math.floor(ev.offsetY / kGRID) * kGRID + 'px';
    view.focus();
  }

  if (state) {
    view.setState(state);
  } else {
    view.showFile(filePath);
  }
  return view;
}

function loadStateFile(filePath) {
  if (!filePath) {
    filePath = prompt(
        'Which state file should be opened? Please insert the file path:');
  }

  if (!filePath) return;

  stateManager.close();
  stateManager = new StateManager(filePath);
}

function parseLocationSearch() {
  var res = {};
  location.search.substring(1).split('&').forEach(function(bit) {
    var split = bit.split('=');
    res[split[0]] = split[1];
  });
  return res;
}

function onLoad() {
  var stateFile = parseLocationSearch()['stateFile'];

  if (!stateFile) {
    alert(
      'Please specify a stateFile via the ?search of the current URL\n:' +
      'E.g.: localhost/?stateFile=/path/to/file');
    return;
  }

  stateManager = new StateManager(stateFile);

  var editorContainer = document.getElementById('editorContainer');
  editorContainer.addEventListener('dblclick', function(ev) {
    if (ev.target !== editorContainer) return;

    createNewView(ev);
    ev.preventDefault();
    ev.stopPropagation();
    return false;
  });
  
  setInterval(function() {
    stateManager.save();
  }, 5000);
}


