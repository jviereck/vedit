var kGRID = 20;
var kRESIZE = 1.3;

// Simple browser detection. Code borrowed from CodeMirror's source.
var ios = /AppleWebKit/.test(navigator.userAgent) && /Mobile\/\w+/.test(navigator.userAgent);
var mac = ios || /Mac/.test(navigator.platform);

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
  this.dom = document.getElementById('editorContainer');

  var self = this;
  this.initPromise = fs.get(stateFilePath).then(function(content) {
    var state = {};
    try {
      state = JSON.parse(content);
    } catch (e) {
      alert('Seems like the stateFile is corrupted. Will reset it.');
    }
    return state;
  }, function(error) {
    alert('Failed to open the specified state file. Will create a new one there.');
    return {};
  }).then(function(state) {
    self.applyState(state);
    self.appliesStateFile = false;
    return state;
  });
}

StateManager.prototype.getDefaultState = function() {
  return {
    settings: {
      tab_size: 4,
      font_size: 11,
      trim_trailing_white_space_on_save: false
    },
    views: []
  };
}

StateManager.prototype.getPanels = function(type) {
  return this.views.filter(function(view) {
    return view.type === type;
  });
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
  state = mixin(this.getDefaultState(), state);
  state.settings = mixin(this.getDefaultState().settings, state.settings);
  this.settings = state.settings;
  this.views = state.views.map(function(viewState) {
    if (viewState.type == 'EditorView') {
      return new EditorView(this.dom, viewState);
    } else if (viewState.type == 'SearchView') {
      return new SearchView(this.dom, viewState);
    } else if (viewState.type == 'HeadsUpPanel') {
      return new HeadsUpPanel(this.dom, viewState);
    } else {
      alert('Got unkown type of panel: ' + viewState.type);
    }
  }, this);
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
    settings: this.settings || this.getDefaultSettings(),
    views: _.compact(this.views.map(function(view) {
      return view.getState();
    }))
  }, null, 2);
  if (this.stateFilePath) {
    fs.set(this.stateFilePath, state);
  }
}

StateManager.prototype.bringToFront = function(panel) {
  if (panel.dom !== this.dom.lastChild) {
    // Update the dom.
    this.dom.removeChild(panel.dom);
    this.dom.appendChild(panel.dom);
    panel.layout();

    // Update also the list of the panels in the state array, such that the
    // panels show up in the new order the next time the stateFile is loaded.
    this.views.splice(this.views.indexOf(panel), 1);
    this.views.push(panel);
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
    css: 'css',
    cpp: 'text/x-c++src',
    h: 'text/x-c++hdr',
    c: 'text/x-csrc'
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
          var rootDoc = new CodeMirror.Doc(content, fileMode);
          rootDoc.lastSaveContentHash = md5(content);
          resolve(rootDoc);
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
      rootDocValue = rootDoc.getValue();
      if (stateManager.settings.trim_trailing_white_space_on_save) {
        rootDocValue = rootDocValue.split('\n').map(function(line) {
          return line.replace(/\s+$/, '');
        }).join('\n');
      }
      if (md5(rootDocValue) !== rootDoc.lastSaveContentHash) {
      	fs.set(filePath, rootDoc.getValue());
        rootDoc.lastSaveValue = rootDocValue;
      }
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

function snap(coordinate) {
  return Math.floor(coordinate / kGRID) * kGRID;
}

var smartMovePanel = null;
var mouseStartPos = null;
var domPos = {};
var onlyDraggableKeys = false;

function resetSmartDragging() {
  onlyDraggableKeys = false;
  mouseStartPos = null;
  smartMovePanel = null;
}

// Determines if the pressed key is the action key.
// On mac, the action key is the Cmd key, otherwise use the CTRL key.
function isActionKey(evt) {
  if (mac) {
    // MetaKey: 91 = chrome, 224 = gecko
    return [91, 224, 16].indexOf(evt.keyCode) >= 0 && !evt.ctrlKey && evt.metaKey;
  } else {
    return [16, 17].indexOf(evt.keyCode) >= 0;
  }
}

window.addEventListener('keydown', function(evt) {
  // For dragging with only Action key.
  if (!evt.altKey && !evt.altGraphKey && evt.charCode == 0 && isActionKey(evt)) {
    var oldOnlyDraggableKeys = onlyDraggableKeys;
    if (evt.keyCode == 16) {
      onlyDraggableKeys = 'Shift-Cmd';
    } else {
      onlyDraggableKeys = 'Cmd';
    }
    if (oldOnlyDraggableKeys !== onlyDraggableKeys) {
      smartMovePanel = null;
    }
  } else {
    resetSmartDragging();
  }
});
window.addEventListener('keyup', resetSmartDragging);
window.addEventListener('click', resetSmartDragging);
window.addEventListener('blur', resetSmartDragging);

window.addEventListener('mousemove', function(evt) {
  if (smartMovePanel) {
    if (onlyDraggableKeys == 'Cmd') {
      var diffX = snap(evt.pageX - mouseStartPos.x);
      var diffY = snap(evt.pageY - mouseStartPos.y);

      smartMovePanel.setPosition({
        left: 'calc(' + domPos.left + ' + ' + diffX + 'px)',
        top:  'calc(' + domPos.top  + ' + ' + diffY + 'px)'
      });
    } else if (onlyDraggableKeys == 'Shift-Cmd') {
      var diffX = snap((evt.pageX - mouseStartPos.x) * kRESIZE);
      var diffY = snap((evt.pageY - mouseStartPos.y) * kRESIZE);

      smartMovePanel.setSize({
        width: 'calc(' + domSize.width + ' + ' + diffX + 'px)',
        height: 'calc(' + domSize.height  + ' + ' + diffY + 'px)'
      });
    }
  }
});

var DraggableMixin = {
  initDraggable: function(draggableOptions) {
    var self = this;
    $(this.dom).
      draggable(mixin({
        grid: [ kGRID, kGRID ],
        start: function(event, ui) { self.emit('startDragging', event, ui); },
        stop: function(event, ui) { self.emit('stopDragging', event, ui); },
        drag: function(event, ui) { self.emit('dragging', event, ui); }
      }, draggableOptions || {})).
      resizable({
        grid: kGRID,
        resize: function(event, ui) { self.emit('resize', event, ui); }
      });

    this.dom.addEventListener('keydown', function(evt) {
      if (evt.keyCode == 27 /* ESC */) {
        self.emit('key-esc');
      }
    });

    this.dom.addEventListener('mousemove', function(evt) {
      if (onlyDraggableKeys) {
        if (mouseStartPos == null) {
          mouseStartPos = { x: evt.pageX, y: evt.pageY };
          domPos = self.getPosition();
          domSize = self.getSize();
        } else if (smartMovePanel == null) {
          var diffX = snap(evt.clientX - mouseStartPos.x);
          var diffY = snap(evt.clientY - mouseStartPos.y);
          if (diffX * diffX + diffY * diffY > 4 * kGRID * kGRID) {
            smartMovePanel = self;
            mouseStartPos = { x: evt.pageX, y: evt.pageY };
          }
        }
      }
    });

    this.dom.addEventListener('mousedown', function(evt) {
      stateManager.bringToFront(self);
    });
  },

  getStateDraggable: function(state) {
    mixin(state, this.getPosition());
    mixin(state, this.getSize());
  },

  setStateDraggable: function(state) {
    this.setSize(state);
    this.setPosition(state);
  },

  getPositionOnRight: function() {
    var res = {};
    var state = {};
    this.getStateDraggable(state);
    res.top = state.top;
    res.left = 'calc(' + state.left + ' + ' + state.width + ' + ' + kGRID + 'px)';
    return res;
  },

  getPositionInset: function() {
    var res = {};
    var state = {};
    this.getStateDraggable(state);
    res.top = 'calc(' + state.top + ' + 2 * ' + kGRID + 'px)';
    res.left = 'calc(' + state.left + ' + 2 * ' + kGRID + 'px)';
    return res;
  },

  setPosition: function(state) {
    var dom = this.dom;
    dom.style.top = state.top;
    dom.style.left = state.left;
  },

  getCenterTop: function() {
    var size = this.getSize();
    var parent = this.dom.parentNode;
    var scrollLeft = document.body.scrollLeft;
    return {
      top: 100 + 'px',
      left: 'calc((' + parent.offsetWidth + 'px - ' +
      	size.width + ') / 2 + ' + scrollLeft + 'px)'
    }
  },

  getPosition: function(state) {
    var style = window.getComputedStyle(this.dom);
    return { top: style.top, left: style.left };
  },

  setSize: function(state) {
    var dom = this.dom;
    dom.style.width = state.width;
    dom.style.height = state.height;
    this.emit('resize', null, this);
  },

  getSize: function() {
    var style = window.getComputedStyle(this.dom);
    return { width: style.width, height: style.height };
  },

  hide: function() {
    this.dom.style.display = 'none';
    this.emit('hide');
  },

  isHidden: function() {
    return this.dom.style.display === 'none';
  },

  show: function() {
    this.dom.style.display = 'block';
    stateManager.bringToFront(this);
    this.emit('show');
  },

  layout: function() { }
};
mixin(DraggableMixin, Jvent.prototype);

function SearchView(parentDom, state) {
  var self = this;
  this.parentDom = parentDom;
  this.type = 'SearchView';

  var dom = this.dom = document.createElement('div');
  dom.setAttribute('class', 'searchUI-view ui-widget-content draggable');

  var domTemplate = document.getElementById('searchUI-template');
  dom.innerHTML = domTemplate.textContent;

  var editorDom = dom.querySelector('.searchUI-editor');
  var editor = this.editor = CodeMirror(editorDom, {
    readOnly: true
  });

  this.editorView = null;
  this.$resetEditorView = this.resetEditorView.bind(this);

  this.on('key-esc', function() {
    // Only hide and not close, such that the state is still there when the
    // panel is reopened later again.
    self.hide();
  });

  this.on('dragging', function(event) {
    var editorView = self.editorView;
    if (!editorView) return;

    editorView.setPosition(self.getPositionOnRight());
  });

  this.on('show', function() {
    if (self.editorView) {
      self.editorView.show();
    }
    self.queryInput.select();
    self.queryInput.focus();
  });

  // On every cursor update, sync the editor on the right.
  var editorCursorActivity = function editorCursorActivity(cm) {
    var selections = editor.listSelections();
    if (selections.length == 0) return;

    var sel = selections[0];
    var lines = editor.getValue().split('\n');
    var lineIdx = sel.head.line;

    var lineNum = lines[lineIdx].match(/^\s*\d+/);
    if (!lineNum) return;
    lineNum = parseInt(lineNum, 10);

    // TODO: Remove unix path hack here. Windows paths don't start with
    // an '/' character!
    while (lineIdx > 0 && lines[lineIdx].indexOf('/') !== 0) {
      lineIdx --;
    }
    // In case no file could be found, just return.
    if (lineIdx === -1) return;

    var editorState = mixin({
      filePath: lines[lineIdx],
      cursor: { line: lineNum, ch: 9 }
    }, self.getPositionOnRight() /* from DraggableMixin */);

    if (!self.editorView) {
    self.editorView = new EditorView(parentDom, editorState /* defaultState */);
      // As soon as the editor view is dragged, make it become "independent".
      // TODO: Add a visual feedback about the binding and unbinding.
      self.editorView.
        on('startDragging', self.$resetEditorView).
        on('close', self.$resetEditorView);
    } else {
      self.editorView.setState(editorState);
    }
  }

  editor.on('dblclick', editorCursorActivity);

  var cmdInput = this.cmdInput = dom.querySelector('.searchUI-cmd');
  var queryInput = this.queryInput = dom.querySelector('.searchUI-search');
  queryInput.addEventListener('keydown', function(evt) {
    if (evt.keyCode == 13) {
      self.exec();
    }
  });


  this.initDraggable({ cancel: ".searchUI-editor, input"} /* draggableOptions */);

  this.setState(state || this.getDefaultState());

  stateManager.addView(this);
  parentDom.appendChild(dom);
}

mixin(SearchView.prototype, DraggableMixin);

SearchView.prototype.focus = function() {
  this.queryInput.focus();
}

SearchView.prototype.resetEditorView = function() {
  if (this.editorView) {
    this.editorView.offListener(this.$resetEditorView);
    this.editorView = null;
  }
}

SearchView.prototype.exec = function() {
  var options = {};
  var query = this.queryInput.value;
  query = '"' + query.replace(/"/g, '\\"') + '"';
  var cwd = getProjectRoot() + '/';
  var cmd = 'ag -A 3 -B 3 -Q -i ' + query;

  if (cwd) options.cwd = cwd.trim();

  var self = this;
  this.editor.setValue('Executing...');
  $.post('/exec', JSON.stringify({
    cmd: cmd,
    options: options
  })).then(function(content) {
    if (cmd.indexOf('ag') === 0) {
      content = self.formatResponse(options.cwd || '', content);
    }
    self.editor.setValue(content);
  }, function(xhr) {
    self.editor.setValue(
      'There was an error while executing the command:\n\n' +
      '  ' + xhr.responseText);
  });
}

SearchView.prototype.getDefaultState = function() {
  var res = { type: this.type };

  this.getStateDraggable(res);
  res.query = '';
  return res;
}

SearchView.prototype.formatResponse = function(cwd, res) {
  var lines = res.split('\n').filter(function(line) {
    return line.length > 0;
  });

  var out = [];
  var lastFile = '';
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var fileName = line.match(/^(.*?):/)[1];

    if (lastFile !== fileName) {
      if (i !== 0) {
        out.push('');
      }
      out.push(cwd + fileName);
    }
    var line = line.substring(fileName.length + 1);
    var lineNumber = line.match(/\d+/)[0];
    var line = line.substring(lineNumber.length);
    if (line[0] === '-') {
      line = '  ' + line.substring(1);
    } else {
      line = ': ' + line.substring(1);
    }

    lineNumber = parseInt(lineNumber, 10);

    if (lineNumber < 10) {
      lineNumber = '   ' + lineNumber;
    } else if (lineNumber < 100) {
      lineNumber = '  ' + lineNumber;
    } else if (lineNumber < 1000) {
      lineNumber = ' ' + lineNumber;
    }

    out.push(lineNumber + line);

    lastFile = fileName;
  }
  return out.join('\n');
}

SearchView.prototype.getState = function() {
  var res = this.getDefaultState();
  res.query = this.queryInput.value;
  res.isHidden = this.isHidden();
  return res;
}

SearchView.prototype.setState = function(state) {
  this.setStateDraggable(state);
  this.queryInput.value = state.query;
  if (state.isHidden) {
    this.hide();
  }
}

SearchView.prototype.close = function() {
  this.emit('close');
  this.removeEverything();
  this.parentDom.removeChild(this.dom);
  stateManager.removeView(this);
}

SearchView.prototype.layout = function() {
  this.editor.refresh();
}

// TODO: Add proper OS-path parsing here to remove the file from the
// path name.
function getProjectRoot() {
  var paths = stateManager.stateFilePath.split('/');
  paths.pop();
  return paths.join('/')
}

function getFileName(path) {
  var splits = path.split('/');
  return splits[splits.length - 1];
}

var keys = {
  'save': ['Ctrl-S', 'Cmd-S'],
  'fork': ['Ctrl-F', 'Ctrl-F'],
  'searchFile': ['Shift-Ctrl-F', 'Shift-Cmd-F'],
  'zoomIn': ['Ctrl-=', 'Cmd-='],
  'zoomOut': ['Ctrl--', 'Cmd--'],
  'zoomReset': ['Ctrl-0', 'Cmd-0']
}

function defineKey(hash, maps) {
  for (var name in maps) {
    if (maps.hasOwnProperty(name)) {
      hash[keys[name][mac ? 1 : 0]] = maps[name];
    }
  }
}

function EditorView(parentDom, state) {
  var self = this;
  this.settings = {};
  this.parentDom = parentDom;
  this.type = 'EditorView';

  var dom = this.dom = document.createElement('div');
  dom.setAttribute('class', 'draggable ui-widget-content editor-view');

  var editorDom = this.editorDom = document.createElement('div');
  editorDom.setAttribute('class', 'editor-container');

  dom.appendChild(editorDom);
  parentDom.appendChild(dom);

  dom.addEventListener('dblclick', function(ev) {
    ev.stopPropagation();
  })

  this.on('key-esc', function() {
    self.close();
  });

  var extraKeysMap = {};
  defineKey(extraKeysMap, {
    'save': function(cm) {
      docManager.saveAll();
      stateManager.save();
    },
    'fork': function(cm) {
      var newState = mixin(self.getState(), self.getPositionOnRight());
      var view = new EditorView(parentDom, mixin(newState, {width: '450px'}));
      view.focus();
    },
    'searchFile': function(cm) {
      stateManager.searchView.show();
      stateManager.searchView.focus();
      stateManager.searchView.setPosition(self.getPositionInset());
    },
    "zoomIn": function(cm) {
      self.setFontZoom(self.fontZoom * 1.05);
    },
    "zoomOut": function(cm) {
      self.setFontZoom(self.fontZoom / 1.05);
    },
    "zoomReset": function(cm) {
      self.setFontZoom(1.0);
    }
  });

  var editor = this.editor = CodeMirror(editorDom, {
    lineWrapping: false,
    fixedGutter: true,
    lineNumbers: true,
    indentWithTabs: false,
    rulers: [{color: '#ddd', column: 80, lineStyle: 'dashed'}],
    extraKeys: extraKeysMap
  });
  editor.on('gutterClick', function(cm, line, gutter, evt) {
    if (evt.detail == 2 /* dblClick */) {
      self.toggleGutter();
    }
  });

  this.gutterHidden = true;
  this.fontZoom = 1.0;

  if (state) this.setState(state);

  // Init the mixins.
  this.initDraggable({ cancel: "pre"} /* draggableOptions */);
  this.on('resize', this.layout.bind(this));

  stateManager.addView(this);
}

mixin(EditorView.prototype, DraggableMixin);

EditorView.prototype.focus = function() {
  this.editor.focus();
}

EditorView.prototype.toggleGutter = function() {
  this.setGutterVisibility(!this.gutterHidden);
  this.layout();
}

EditorView.prototype.setFontZoom = function(fontZoom) {
  this.fontZoom = fontZoom;
  this.editor.display.wrapper.style.fontSize = this.settings.font_size * fontZoom + 'px';
  this.layout();
}

EditorView.prototype.setGutterVisibility = function(hidden) {
  this.gutterHidden = hidden;
  if (hidden) {
	this.editor.setOption('lineNumbers', false);
    this.editor.setOption('gutters', ['gutter-placeholder']);
  } else {
	this.editor.setOption('lineNumbers', true);
    this.editor.setOption('gutters', []);
  }
}

EditorView.prototype.createLineMarkFromSelection = function() {
  var editor = this.editor;
  var selections = editor.listSelections();
  selections.forEach(function(selection) {
    var from = selection.head;
    var to = selection.anchor;

    if (from.line > to.line || from.ch > to.ch) {
      var t = from;
      from = to; to = t;
    }
    this.createLineMark(from, to)
  }, this);
};

EditorView.prototype.createLineMark = function(from, to, hideMarkedContent) {
  var editor = this.editor;

  var hideMarkedContent = !hideMarkedContent;
  var widget = document.createElement('span');
  widget.innerHTML = '<strong>Marked some lines here.</strong>';

  var marker = null;
  var toggleMarker = function() {
    hideMarkedContent = !hideMarkedContent;
    if (hideMarkedContent) {
      marker = editor.markText(from, to, {
        replacedWith: widget
      });
    } else {
      marker = editor.markText(from, to);
    }
  }
  toggleMarker();

  var lineAboveWidget = document.createElement('div');
  lineAboveWidget.className = 'lineMarker-top';

  var lineWidget = document.createElement('div');
  lineWidget.className = 'lineMarker-bottom';

  var toggleButton = document.createElement('button');
  toggleButton.appendChild(document.createTextNode('Toggle'));
  toggleButton.onclick = function(evt) {
    var find = marker.find();
    from = find.from; to = find.to;
    marker.clear();
    toggleMarker();
  }

  var removeButton = document.createElement('button');
  removeButton.appendChild(document.createTextNode('Remove lines mark'));
  removeButton.onclick = function() {
    marker.clear();
    widgetBelow.clear();
    widgetAbove.clear();
  }

  lineAboveWidget.appendChild(toggleButton);
  lineAboveWidget.appendChild(removeButton);
  var widgetAbove = editor.addLineWidget(from.line, lineAboveWidget, {
    above: true
  });
  var widgetBelow = editor.addLineWidget(to.line, lineWidget);
}

EditorView.prototype.layout = function() {
  this.editor.refresh();
}

EditorView.prototype.focus = function() {
  this.editor.focus();
}

EditorView.prototype.close = function() {
  this.emit('close');
  this.removeEverything();
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

  var res = { type: this.type };
  var scrollInfo = this.editor.getScrollInfo();
  var dom = this.dom;

  this.getStateDraggable(res);
  res.settings = this.settings;
  res.filePath = filePath;
  res.scrollX = scrollInfo.left;
  res.scrollY = scrollInfo.top;
  res.gutterHidden = this.gutterHidden;
  res.fontZoom = this.fontZoom;
  return res;
}

EditorView.prototype.showFile = function(filePath, options) {
  // Nothing todo if the file to show stayed the same ;)
  if (this.docPromise && this.docPromise.filePath === filePath) {
    this.emit('showFile', filePath);
    return this.docPromise;
  }

  var self = this;
  this.docPromise = docManager.get(filePath, options).
    then(function(doc) {
      self.editor.swapDoc(doc);
      self.emit('showFile', filePath);
    }, function() {
      self.editor.setValue('Failed to get the file. Closing view again.')
      self.emit('showFile', filePath);
    });
  this.docPromise.filePath = filePath;
  return this.docPromise;
}

EditorView.prototype.setState = function(state) {
  var self = this;
  var dom = this.dom;

  this.setStateDraggable(state);

  var settings = this.settings = mixin(state.settings || {}, stateManager.settings);
  this.editor.setOption('tabSize', settings.tab_size);

  this.setGutterVisibility(state.gutterHidden);
  this.setFontZoom(state.fontZoom || this.fontZoom);

  this.showFile(state.filePath, state.fileOptions).then(function() {
    // Once the file is loaded and shown in the editor, either set the cursor
    // position or the selection as set on the state.
    if (state.cursor) {
      var cursorScrollMargin = self.editor.options.cursorScrollMargin;
      // Set the cursor position and scroll the line into the middle
      // of the editor view.
      self.editor.setCursor(state.cursor);
      var top = self.editor.charCoords(state.cursor, "local").top;
      var halfHeight = self.editor.getScrollerElement().offsetHeight / 2;
      self.editor.scrollTo(null, top - halfHeight - 5);
    } else {
      // Set the scroll position only after the file is loaded, such that the
    // scrollIntoView will apply to the loaded file.
      self.editor.scrollTo(state.scrollX, state.scrollY);
    }
  });
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

function HeadsUpPanel(parentDom, state) {
  var self = this;
  this.parentDom = parentDom;
  this.type = 'HeadsUpPanel';

  var dom = this.dom = document.createElement('div');
  dom.setAttribute('class', 'headsUp-panel ui-widget-content draggable');

  var domTemplate = document.getElementById('headsUp-template');
  dom.innerHTML = domTemplate.textContent;

  this.selectedIdx = 0;
  this.inputDom = dom.querySelector('.headsUp-input');
  this.listDom = dom.querySelector('.headsUp-list');

  this.on('show', function() {
    self.inputDom.focus();
  });

  // Debounced version of the default keydown handling.
  var keydownHandling = _.debounce(function(evt) {
    if (evt.keyCode == 38) {
      self.selectedIdx -= 1;
    } else if (evt.keyCode == 40) {
      self.selectedIdx += 1;
    } else if (evt.keyCode == 13) {
      self.handleItemChoice(self.selectedIdx);
    } else if (evt.keyCode == 27) {
      self.hide();
    } else if (evt.keyCode !== 37 && evt.keyCode !== 39) {
      // If no arrow-key was pressed, then reset the index.
      self.selectedIdx = 0;
    }
    self.updateList();
  }, 33, {  maxWait: 33 });

  // Adding the keydown event here. Need to prevent the down and right arrow
  // key event immediately to prevent the cursor from moving to the left and
  // right of the input field. Finally, call the debounde keydown handler.
  this.inputDom.addEventListener('keydown', function(evt) {
    if (evt.keyCode == 38 || evt.keyCode == 40) {
      evt.preventDefault();
    }
    keydownHandling(evt);
  });

  this.inputDom.addEventListener('keyup', function(evt) {
    self.updateList();
  });

  $(this.listDom).on('click', 'li', function() {
    self.handleItemChoice(parseInt(this.getAttribute('data-id'), 10));
  });

  this.on('show', function() {
    self.inputDom.value = '';
    self.inputDom.focus();
    self.setPosition(self.getCenterTop());
    self.updateFileListCache();
  });

  this.fileCache = [];
  this.fileCacheLowercase = [];
  this.resultList = [];
  this.updateFileListCache();

  this.initDraggable({ cancel: ".headsUp-list, input"} /* draggableOptions */);
  parentDom.appendChild(dom);

  if (state) this.setState(state);
  stateManager.addView(this);
}

mixin(HeadsUpPanel.prototype, DraggableMixin);

HeadsUpPanel.prototype.handleItemChoice = function(index) {
  var item = this.resultList[index];

  if (!item) return;

  var filePath = getProjectRoot() + '/' + item.substring(2);

  // Open the file in a new EditorPanel.
  new EditorView(stateManager.dom,
    mixin({ filePath: filePath }, this.getPosition()));
  this.hide();
}

HeadsUpPanel.prototype.updateFileListCache = function() {
  var self = this;
  var cwd = getProjectRoot();
  $.post('/exec', JSON.stringify({
    cmd: "find . -not -path '*/\.*'",
    options: { cwd: cwd }
  })).then(function(content) {
    self.selectedIdx = 0;
    self.fileCache = content.split('\n');
    self.fileCacheLowercase = self.fileCache.map(function(entry) {
      return entry.toLowerCase();
    });
    self.updateList();
  });
}

HeadsUpPanel.prototype.updateList = function() {
  var maxLength = 50;
  var overSize = false;
  this.listDom.textContent = '';

  var query = this.inputDom.value.toLowerCase();
  if (query === '') return;

  // Compute the result list to show.
  var results = [];
  var fileCache = this.fileCache;
  var fileCacheLowercase = this.fileCacheLowercase;
  for (var i = 0; i < fileCacheLowercase.length; i++) {
    var entry = fileCacheLowercase[i];
    if (entry.indexOf(query) !== -1) {
      var lastIndex = entry.lastIndexOf(query);
      results.push({
	    // Smaller score is better.
        score: (entry.length - lastIndex) * entry.length,
        entry: fileCache[i]
      });
    }
  }

  results = results.sort(function(a, b) {
    return a.score - b.score;
  }).map(function(obj) { return obj.entry; });

  if (results.length > maxLength) {
    overSize = true;
    results = results.slice(0, maxLength);
  }

  this.resultList = results;

  // Restrict the index to a valid range.
  this.selectedIdx = Math.min(Math.max(0, this.selectedIdx), results.length - 1);

  this.listDom.innerHTML = results.map(function(path, index) {
    var className = (this.selectedIdx === index) ? 'selected' : '';
    var out = '<li class="headsUp-list-item ' + className + '" data-id="' + index + '">';
    out += '<div class="headsUp-filename">' + getFileName(path) + '</div>';
    out += '<div class="headsUp-path">' + path + '</div>';
    out += '</li>';
    return out;
  }, this).join('');

  if (overSize) {
    this.listDom.innerHTML += '<li>And more files not shown...</li>';
  }

  // Scroll the selected item into view if there are some results at all.
  if (results.length !== 0) {
    this.listDom.children[this.selectedIdx].scrollIntoViewIfNeeded();
  }
}

HeadsUpPanel.prototype.getDefaultState = function() {
  var res = { type: this.type };
  this.getStateDraggable(res);
  return res;
}

HeadsUpPanel.prototype.getState = function() {
  var res = this.getDefaultState();
  res.query = this.inputDom.value;
  res.isHidden = this.isHidden();
  return res;
}

HeadsUpPanel.prototype.setState = function(state) {
  this.setStateDraggable(state);
  this.inputDom.value = state.query;
  if (state.isHidden) {
    this.hide();
  }
}

function onLoad() {
  var stateFile = parseLocationSearch()['stateFile'];

  if (!stateFile) {
    alert(
      'Please specify a stateFile via the ?search of the current URL\n:' +
      'E.g.: localhost/?stateFile=/path/to/file');
    return;
  }

  var editorContainer = document.getElementById('editorContainer');

  window.stateManager = new StateManager(stateFile);
  stateManager.initPromise.then(function() {
    stateManager.searchView = stateManager.views.filter(function(panel) {
      return panel.type == 'SearchView';
    })[0];
    stateManager.headsUpPanel = stateManager.views.filter(function(panel) {
      return panel.type == 'HeadsUpPanel';
    })[0];

    if (!stateManager.searchView) {
      stateManager.searchView = new SearchView(editorContainer);
      stateManager.searchView.hide();
    }

    if (!stateManager.headsUpPanel) {
      stateManager.headsUpPanel = new HeadsUpPanel(editorContainer);
      stateManager.headsUpPanel.hide();
    }
  });

  document.addEventListener('keydown', function(evt) {
    if (evt.metaKey == true) {
      if (evt.keyCode == 80 /* P */) {
        stateManager.headsUpPanel.show();
        evt.preventDefault();
        evt.stopPropagation();
      } else if (evt.keyCode == 70 /* F */ && evt.shiftKey) {
        stateManager.searchView.show();
        evt.preventDefault();
        evt.stopPropagation();
      }
    }
  }, true);

  editorContainer.addEventListener('dblclick', function(evt) {
    if (evt.target !== editorContainer) return;

    stateManager.headsUpPanel.show();
    stateManager.headsUpPanel.setPosition({
      top: snap(evt.pageY) + 'px',
      left: snap(evt.pageX) + 'px'
    });

    evt.preventDefault();
    evt.stopPropagation();
  });

  // Save the current editor state every 5 sec.
  setInterval(function() {
    stateManager.save();
  }, 5000);
}
