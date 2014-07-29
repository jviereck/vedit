var kGRID = 20;

var stateManager = null;

var fs = {
  get: function(filePath, callback, type) {
    return $.get('fs/' + filePath.replace(/\//g, '|'), callback, type || 'text');
  },

  set: function(filePath, content) {
    return $.post('fs/' + filePath.replace(/\//g, '|'), content);
  }
}

function StateManager(stateFilePath) {
  this.stateFilePath = stateFilePath;
  this.views = [];
  this.allowSave = true;

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
    fs.get(stateFilePath, function(content) {
      self.applyState(JSON.parse(content));
    });
  }
}

StateManager.prototype.addView = function(view) {
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
    return createNewView(null, null, viewState);
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

  var state = JSON.stringify({
    stateFilePath: this.stateFilePath,
    views: this.views.filter(function(view) {
      // Don't save the views that are associated to documents without a
      // filename.
      // FIXME: In this case, the content of the file should be saved on the
      //   state directly.
      return view.getFilePath();
    }).map(function(view) {
      return view.getState();
    })
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
        fs.get(filePath, function(content) {
          var fileEnding = filePath.substring(filePath.lastIndexOf('.') + 1);
          var fileMode = self.fileExtensionModeMap[fileEnding] || '';
          // Once the file content is there, create a new CodeMirror document
          // object and resolve the root-doc-promise.
          resolve(new CodeMirror.Doc(content, fileMode));
        }, 'text').fail(reject);
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

function EditorView(parentDom, doc) {
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

  $(this.dom).
    draggable({ grid: [ kGRID, kGRID ] }).
    resizable({
      grid: kGRID,
      resize: function(event, ui) {
        self.layout();
      }
    });

  var editor = this.editor = CodeMirror(editorDom, {
    lineWrapping: false,
    fixedGutter: true,
    lineNumbers: true,
    indentWithTabs: false,
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

  // Based on 'codemirror/demo/indentwrap.html':
  // var charWidth = this.editor.defaultCharWidth(), basePadding = 4;
  // this.editor.on("renderLine", function(cm, line, elt) {
  //   var off = (CodeMirror.countColumn(line.text, null, cm.getOption("tabSize")) + 2) * charWidth;
  //   elt.style.textIndent = "-" + off + "px";
  //   elt.style.paddingLeft = (basePadding + off) + "px";
  // });
}

EditorView.prototype.layout = function() {
  this.editor.refresh();
}

EditorView.prototype.focus = function() {
  this.editor.focus();
}

EditorView.prototype.close = function() {
  this.parentDom.removeChild(this.dom);
  stateManager.removeView(view);
}

EditorView.prototype.getFilePath = function() {
  return this.editor.getDoc().filePath;
}

EditorView.prototype.getState = function() {
  var dom = this.dom;
  var res = {
    top: dom.style.top,
    left: dom.style.left,
    width: dom.style.width,
    height: dom.style.height
  };
  res.fileOptions = this.fileOptions;
  res.filePath = this.getFilePath();;
  res.scrollInfo = this.editor.getScrollInfo();
  return res;
}

EditorView.prototype.showFile = function(filePath, options) {
  var self = this;
  docManager.get(filePath, options).then(function(doc) {
    self.editor.swapDoc(doc);
  }, function() {
    self.editor.setValue('Failed to get the file. Closing view again.')
  });
}

EditorView.prototype.setState = function(state) {
  var dom = this.dom;
  dom.style.top = state.top;
  dom.style.left = state.left;
  dom.style.width = state.width;
  dom.style.height = state.height;
  this.fileOptions = state.fileOptions;
  this.showFile(state.filePath, state.fileOptions);
  this.editor.scrollIntoView(state.scrollInfo);
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
    stateManager.addView(view);
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

function onLoad() {
  stateManager = new StateManager()

  document.getElementById('editorContainer').
    addEventListener('dblclick', function(ev) {
      createNewView(ev);
      ev.preventDefault();
      ev.stopPropagation();
      return false;
    });
}
