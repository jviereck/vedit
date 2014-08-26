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

(on OS X, for other systems see [their readme](https://github.com/ggreer/the_silver_searcher#installation))

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

- open a file: double click somewhere on the editor area to search for files from
  the root of the current state file directory
- the editor panel can be moved by dragging the editor's gutter or pressing the
  Cmd key while moving the mouse
- the editor panel can be resized on the right and bottom edge or by pressing the
  Cmd and Shift key while moving the mouse
- there is a project wide search

Notes showing what might come next are availabe in the [notes.txt](notes.txt) file.

## Key combinations for the editor

Key         | Action
------------|----------------------
ESC         | closes the panel
Cmd-S       | saves ALL files that were changed
Ctrl-F      | forks the current editor view - opens a new view into the same file
Shift-Cmd-F | opens the search panel
Cmd-=       | zoom text in
Cmd--       | zoom text out
Cmd-0       | reset zoom


