# vEdit

A new code editor - different by behaviour.

## Status

The project is a prototype. Don't expect much at this point. Overall, the goal of
the project is to explore different behaviors / ideas for an editor. Adding a lot
of helper features (like code completion) is not top priority at the moment.

## How to get it running

At the point of writing, the "editor" is nothing else than a served web page. To
install the necessary packages, run

``` bash
npm install
```

install the `ag` command (short version: a faster `ack` replacement) via

``` bash
brew install the_silver_searcher
```

and then the server can be started via

``` bash

node server.js
```

This starts the server on port 7777. The serve does not a lot: the files for the
editor are served via a static web server. Beside this, the server reads and
writes files as dictated by the editor, which is not possible by using (normal
web pages) APIs. Also, the server can run (bash) commands as requested from the
client (this is at the moment used to enable a simple file search across the
project).

## Defining a stateFile

The editor stores it state and additional metadata in what is called a "state file"
(you could also think about it as a project-description-file). When loading the
editor, the location of the state file must be supplied as a search query, e.g.

```
http://localhost:7777/?stateFile=/Users/someUser/path/to/stateFile.json
```

If the state file does not exist at the given location, vEdit will create an empty
file for you.

## Features available so far

There are not many features yet. Here is what is possible:

- open a file: double click somewhere on the editor area and enter the file path
  you want to open in the input box. This opens a new editor panel
- the editor panel can be moved by dragging the editor's gutter
- the editor panel can be resized on the right and bottom edge
- there is a project wide search (well, actually there is something that executes
  a command on your command line and shows you the result... see more below)


## Key combinations for the editor

Key         | Action
------------|----------------------
ESC         | closes the panel
Cmd-S       | saves ALL files that were changed
Ctrl-F      | forks the current editor view - opens a new view into the same file
Shift-Cmd-F | opens the search panel

## Cross-Project search

This is kind of a ugly hack at the moment. From an editor panel, press `Cmd+Shift+F`
to open the "search" window. The panel you see executes the specified command
on the server and displayes the result in the panel. The working directory to
execute the command in is specify by the part after the `@` sign, e.g.

```
some-command $0 @ /some/working/path
```

will run `some-command` from the directory `/some/working/path`. The `$0` is a
placeholder for the entered "query" string. When pressing ENTER on the query input
field, the command is executed. At the moment, the code assumes the output to come
from the `ag` command. Clicking on a line on the output will open a editor panel
of the corresponding file. If you want to keep the editor panel opened after the
search panel is closed, you have to drag it away. You can close the search panel
by pressing ESC when the editor is focused.

