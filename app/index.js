
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
    draggable({ grid: [ 20, 20 ] }).
    resizable({ grid: 20 });

  this.editor = CodeMirror(editorDom, {
    lineWrapping: true,
    fixedGutter: true,
    lineNumbers: true,
    extraKeys: {
      "Cmd-D": function(cm) {
        parentDom.removeChild(self.dom);
      }
    }
  });
}

EditorView.prototype.layout = function() {
  this.editor.refresh();
}

EditorView.prototype.focus = function() {
  this.editor.focus();
}

function createNewView(ev) {
  var editorContainer = document.getElementById('editorContainer');
  var view = new EditorView(editorContainer);

  if (ev) {
    view.dom.style.left = ev.offsetX + 'px';
    view.dom.style.top = ev.offsetY + 'px';
    view.focus();
  }
}

function onLoad() {
  document.getElementById('editorContainer').
    addEventListener('dblclick', function(ev) {
      createNewView(ev);
      ev.preventDefault();
      ev.stopPropagation();
      return false;
    });
}

