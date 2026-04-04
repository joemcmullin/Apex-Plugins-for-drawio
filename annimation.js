/**
 * Animation Plugin for draw.io (Cleaned & Commented)
 *
 * Copyright (c) 2020-2025, JGraph Holdings Ltd
 * Copyright (c) 2020-2025, draw.io AG
 *
 * Adds an "Animation..." option to the Extras menu that opens a window
 * for scripting step-by-step reveal/hide/flow animations on diagram cells.
 *
 * Script syntax (one command per line):
 *   show <cellId> [fade]         — Reveal a cell with wipe (default) or fade
 *   hide <cellId>                — Fade out a cell
 *   flow <cellId> [start|stop]   — Toggle dashed flow animation on an edge
 *   wait <milliseconds>          — Pause before the next command
 */
Draw.loadPlugin(function (editorUi) {

    // ==========================================================================
    // 1. MENU REGISTRATION
    //    Adds "Animation..." to the Extras menu and wires up the toggle action.
    // ==========================================================================

    mxResources.parse('animation=Animation...');

    editorUi.actions.addAction('animation', function () {
        if (this.animationWindow == null) {
            this.animationWindow = new AnimationWindow(
                editorUi,
                (document.body.offsetWidth - 480) / 2,
                120,
                640,
                480
            );
            this.animationWindow.window.setVisible(true);
        } else {
            this.animationWindow.window.setVisible(
                !this.animationWindow.window.isVisible()
            );
        }
    });

    // Append "Animation..." as the last item in the Extras menu
    var menu = editorUi.menus.get('extras');
    var oldFunct = menu.funct;

    menu.funct = function (menu, parent) {
        oldFunct.apply(this, arguments);
        editorUi.menus.addMenuItems(menu, ['-', 'animation'], parent);
    };

    // ==========================================================================
    // 2. CORE ANIMATION ENGINE
    //    Handles running a script of animation commands against a cloned graph.
    // ==========================================================================

    var allowedToRun = false;
    var running = false;

    /**
     * Execute wipe-in animation on an array of cells.
     */
    function animateCells(graph, cells, steps, delay) {
        graph.executeAnimations(
            graph.createWipeAnimations(cells, true),
            null,
            steps,
            delay
        );
    }

    /**
     * Recursively build a mapping from original cell IDs to cloned cell
     * references so the script can reference cells by their original IDs
     * while operating on the preview clone.
     */
    function mapCell(cell, clone, mapping) {
        mapping = mapping || {};
        mapping[cell.id] = clone;

        var childCount = cell.getChildCount();
        for (var i = 0; i < childCount; i++) {
            mapCell(cell.getChildAt(i), clone.getChildAt(i), mapping);
        }

        return mapping;
    }

    /**
     * Signal the animation loop to stop after the current command.
     */
    function stop() {
        allowedToRun = false;
    }

    /**
     * Run an animation script against a graph.
     *
     * @param {Graph}    graph — The preview graph instance (cloned from editor)
     * @param {string[]} steps — Array of command strings (one per line)
     * @param {boolean}  loop  — If true, restart animation when it finishes
     */
    function run(graph, steps, loop) {
        if (running) return;

        allowedToRun = true;
        running = true;

        // Phase 1: Hide all cells (set opacity to 0, suppress labels)
        graph.getModel().beginUpdate();
        try {
            var cells = graph.getModel().cells;
            for (var id in cells) {
                var cell = cells[id];
                if (graph.getModel().isVertex(cell) || graph.getModel().isEdge(cell)) {
                    graph.setCellStyles('opacity', '0', [cell]);
                    graph.setCellStyles('noLabel', '1', [cell]);
                }
            }
        } finally {
            graph.getModel().endUpdate();
        }

        // Phase 2: Build ID-to-clone mapping
        var mapping = mapCell(
            editorUi.editor.graph.getModel().getRoot(),
            graph.getModel().getRoot()
        );

        // Phase 3: Step through commands sequentially
        var step = 0;

        function next() {
            // Stop or finished
            if (!allowedToRun || step >= steps.length) {
                running = false;
                if (loop) {
                    graph.refresh();
                    run(graph, steps, loop);
                }
                return;
            }

            var tokens = steps[step].split(' ');

            // Skip empty lines
            if (tokens.length === 0 || tokens[0] === '') {
                step++;
                next();
                return;
            }

            // Handle "wait <ms>" — the only async command
            if (tokens[0] === 'wait' && tokens.length > 1) {
                window.setTimeout(function () {
                    step++;
                    next();
                }, parseFloat(tokens[1]));
                return;
            }

            // All other commands require a cell ID as the second token
            if (tokens.length > 1) {
                var cell = mapping[tokens[1]];

                if (cell != null) {
                    switch (tokens[0]) {
                        case 'show':
                            graph.setCellStyles('opacity', '100', [cell]);
                            graph.setCellStyles('noLabel', null, [cell]);
                            if (tokens.length > 2 && tokens[2] === 'fade') {
                                Graph.fadeNodes(graph.getNodesForCells([cell]), 0, 1);
                            } else {
                                animateCells(graph, [cell]);
                            }
                            break;

                        case 'flow':
                            if (graph.model.isEdge(cell)) {
                                toggleFlowAnim(graph, [cell], tokens[2]);
                            }
                            break;

                        case 'hide':
                            Graph.fadeNodes(graph.getNodesForCells([cell]), 1, 0);
                            break;
                    }
                } else {
                    console.log('cell not found', tokens[1], steps[step]);
                }
            }

            step++;
            next();
        }

        next();
    }

    // ==========================================================================
    // 3. ANIMATION WINDOW UI
    //    Floating window with script editor, preview pane, and action buttons.
    // ==========================================================================

    var AnimationWindow = function (editorUi, x, y, w, h) {

        // --- Layout: 2-row table ---
        var table = document.createElement('table');
        table.style.width = '100%';
        table.style.height = '100%';
        var tbody = document.createElement('tbody');

        // Row 1: Script textarea (left) + Preview graph (right)
        var tr1 = document.createElement('tr');
        var td11 = document.createElement('td');
        td11.style.width = '140px';
        var td12 = document.createElement('td');

        // Row 2: Button toolbar (spans both columns)
        var tr2 = document.createElement('tr');
        tr2.style.height = '40px';
        var td21 = document.createElement('td');
        td21.setAttribute('colspan', '2');

        // --- Script textarea ---
        var list = document.createElement('textarea');
        list.style.overflow = 'auto';
        list.style.width = '100%';
        list.style.height = '100%';
        td11.appendChild(list);

        // Load saved animation script from diagram root
        var getAnimation = function (cell) {
            return editorUi.editor.graph.getAttributeForCell(cell, 'animation') || '';
        };

        var root = editorUi.editor.graph.getModel().getRoot();
        list.value = getAnimation(root);

        // --- Preview graph container ---
        var container = document.createElement('div');
        container.style.border = '1px solid lightGray';
        container.style.background = '#ffffff';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.overflow = 'auto';
        mxEvent.disableContextMenu(container);
        td12.appendChild(container);

        // Read-only preview graph with panning
        var graph = new Graph(container);
        graph.setEnabled(false);
        graph.setPanning(true);
        graph.foldingEnabled = false;
        graph.panningHandler.ignoreCell = true;
        graph.panningHandler.useLeftButtonForPanning = true;
        graph.minFitScale = null;
        graph.maxFitScale = null;
        graph.centerZoom = true;

        // --- Action buttons ---
        // Each button appends its command to the textarea,
        // replacing "CELL" with selected cell IDs.
        var buttons = {
            'Fade In': 'show CELL fade',
            'Wipe In': 'show CELL',
            'Fade Out': 'hide CELL',
            'Flow On': 'flow CELL start',
            'Flow Off': 'flow CELL stop',
            'Flow Toggle': 'flow CELL',
            'Wait': ''
        };

        var defaultWait = 'wait 1000\n';

        Object.keys(buttons).forEach(function (key) {
            var btn = mxUtils.button(key, function () {
                var template = buttons[key];

                if (template.indexOf('CELL') > -1) {
                    var cells = editorUi.editor.graph.getSelectionCells();
                    if (cells.length > 0) {
                        for (var i = 0; i < cells.length; i++) {
                            list.value += template.replace('CELL', cells[i].id) + '\n';
                        }
                        list.value += defaultWait;
                    }
                } else {
                    if (template) {
                        list.value += template + '\n';
                    }
                    list.value += defaultWait;
                }
            });
            td21.appendChild(btn);
        });

        // Preview — clones diagram and runs the script
        var runBtn = mxUtils.button('Preview', function () {
            graph.getModel().clear();
            graph.getModel().setRoot(
                graph.cloneCells([editorUi.editor.graph.getModel().getRoot()])[0]
            );
            graph.maxFitScale = 1;
            graph.fit(8);
            graph.center();
            run(graph, list.value.split('\n'));
        });
        td21.appendChild(runBtn);

        // Stop — halts animation and clears preview
        var stopBtn = mxUtils.button('Stop', function () {
            graph.getModel().clear();
            stop();
        });
        td21.appendChild(stopBtn);

        // Apply — saves script to diagram root
        var applyBtn = mxUtils.button('Apply', function () {
            var root = editorUi.editor.graph.getModel().getRoot();
            editorUi.editor.graph.setAttributeForCell(root, 'animation', list.value);
        });
        td21.appendChild(applyBtn);

        // --- Assemble layout ---
        tr1.appendChild(td11);
        tr1.appendChild(td12);
        tbody.appendChild(tr1);
        tr2.appendChild(td21);
        tbody.appendChild(tr2);
        table.appendChild(tbody);

        // --- Floating window ---
        this.window = new mxWindow('Animation', table, x, y, w, h, true, true);
        this.window.destroyOnClose = false;
        this.window.setMaximizable(false);
        this.window.setResizable(true);
        this.window.setClosable(true);
        this.window.setVisible(true);

        // Auto-save script when navigating between pages
        var currentRoot = editorUi.editor.graph.getModel().getRoot();
        editorUi.editor.graph.addListener(mxEvent.ROOT, function () {
            var newRoot = editorUi.editor.graph.getModel().getRoot();
            if (newRoot !== currentRoot) {
                if (getAnimation(currentRoot) !== list.value) {
                    editorUi.editor.graph.setAttributeForCell(
                        currentRoot, 'animation', list.value
                    );
                }
                currentRoot = newRoot;
                list.value = getAnimation(currentRoot);
            }
        });
    };

    // ==========================================================================
    // 4. CHROMELESS AUTOSTART
    //    In read-only/embedded mode, auto-start animation if one is saved.
    // ==========================================================================

    if (editorUi.editor.isChromelessView()) {
        function startAnimation() {
            var root = editorUi.editor.graph.getModel().getRoot();
            var result = false;

            if (root.value != null && typeof root.value === 'object') {
                var desc = root.value.getAttribute('animation');
                if (desc != null) {
                    run(editorUi.editor.graph, desc.split('\n'), true);
                    result = true;
                }
            }

            return result;
        }

        if (!startAnimation()) {
            editorUi.editor.addListener('fileLoaded', startAnimation);
        }
    }

    // ==========================================================================
    // 5. EDGE FLOW ANIMATION
    //    Toggles CSS-based dashed-line "flow" animation on edge paths.
    // ==========================================================================

    /**
     * Toggle, start, or stop the flow animation on edge cells.
     *
     * @param {Graph}  graph  — Graph containing the edges
     * @param {Array}  cells  — Edge cells to affect
     * @param {string} status — "start", "stop", or "toggle" (default)
     */
    function toggleFlowAnim(graph, cells, status) {
        status = status || 'toggle';

        for (var i = 0; i < cells.length; i++) {
            if (!editorUi.editor.graph.model.isEdge(cells[i])) continue;

            var state = graph.view.getState(cells[i]);
            if (!state || !state.shape) continue;

            var paths = state.shape.node.getElementsByTagName('path');
            if (paths.length <= 1) continue;

            var path = paths[1];
            var isFlowing = path.getAttribute('class') === 'mxEdgeFlow';
            var isDashed = mxUtils.getValue(
                state.style, mxConstants.STYLE_DASHED, '0'
            ) === '1';

            if ((status === 'toggle' && isFlowing) || status === 'stop') {
                path.removeAttribute('class');
                if (!isDashed) path.removeAttribute('stroke-dasharray');
            } else if ((status === 'toggle' && !isFlowing) || status === 'start') {
                path.setAttribute('class', 'mxEdgeFlow');
                if (!isDashed) path.setAttribute('stroke-dasharray', '8');
            }
        }
    }

    // ==========================================================================
    // 6. CSS INJECTION
    //    Injects @keyframes rule for the dashed flow animation.
    // ==========================================================================

    try {
        var style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = [
            '.mxEdgeFlow {',
            '  animation: mxEdgeFlow 0.5s linear;',
            '  animation-iteration-count: infinite;',
            '}',
            '@keyframes mxEdgeFlow {',
            '  to {',
            '    stroke-dashoffset: -16;',
            '  }',
            '}'
        ].join('\n');
        document.getElementsByTagName('head')[0].appendChild(style);
    } catch (e) {
        // Silently ignore — non-critical enhancement
    }

});