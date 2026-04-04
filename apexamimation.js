/**
 * Apex Animation Plugin for draw.io — v2.1
 *
 * Redesigned UI with:
 *   - Styled toolbar with grouped, color-coded buttons
 *   - Settings panel: configurable default wait time
 *   - "Keep Visible" toggle (selective animation mode)
 *   - Cell labels shown as comments in the script
 *   - Step-through debug mode
 *   - Line numbers in the script editor
 *   - Larger, resizable script editor
 *   - Auto Sequence: select cells, sort by numeric ID, generate script
 *
 * Script syntax (one command per line):
 *   show <cellId> [fade]         — Reveal cell with wipe (default) or fade
 *   hide <cellId>                — Fade out a cell
 *   flow <cellId> [start|stop]   — Toggle dashed flow on an edge
 *   wait <milliseconds>          — Pause before the next command
 *   # comment                    — Ignored during playback
 */
Draw.loadPlugin(function (editorUi) {


    // ==========================================================================
    // 1. MENU REGISTRATION
    // ==========================================================================


    mxResources.parse('apexanimation=Apex Animation...');


    editorUi.actions.addAction('apexanimation', function () {
        if (this.apexAnimationWindow == null) {
            this.apexAnimationWindow = new ApexAnimationWindow(
                editorUi,
                (document.body.offsetWidth - 720) / 2,
                80,
                780,
                560
            );
            this.apexAnimationWindow.window.setVisible(true);
        } else {
            this.apexAnimationWindow.window.setVisible(
                !this.apexAnimationWindow.window.isVisible()
            );
        }
    });


    // Safe menu chaining — preserves any previously registered items
    var menu = editorUi.menus.get('extras');
    var prevFunct_anim = menu.funct;
    menu.funct = function (menu, parent) {
        prevFunct_anim.apply(this, arguments);
        editorUi.menus.addMenuItems(menu, ['-', 'apexanimation'], parent);
    };


    // ==========================================================================
    // 2. INJECT STYLES
    // ==========================================================================


    try {
        var cssEl = document.createElement('style');
        cssEl.type = 'text/css';
        cssEl.innerHTML = [
            /* Flow animation keyframes */
            '.mxEdgeFlow {',
            '  animation: mxEdgeFlow 0.5s linear infinite;',
            '}',
            '@keyframes mxEdgeFlow {',
            '  to { stroke-dashoffset: -16; }',
            '}',

            /* Apex Animation window styles */
            '.apex-anim-wrap { display:flex; flex-direction:column; width:100%; height:100%; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; font-size:12px; }',
            '.apex-anim-toolbar { display:flex; flex-wrap:wrap; gap:4px; padding:6px 8px; background:#f4f4f5; border-bottom:1px solid #ddd; align-items:center; }',
            '.apex-anim-toolbar .apex-group { display:flex; gap:2px; padding:0 6px; border-right:1px solid #ccc; align-items:center; }',
            '.apex-anim-toolbar .apex-group:last-child { border-right:none; }',
            '.apex-anim-toolbar .apex-group-label { font-size:9px; color:#888; text-transform:uppercase; letter-spacing:0.5px; margin-right:4px; }',

            '.apex-btn { padding:4px 10px; border:1px solid #bbb; border-radius:4px; background:#fff; cursor:pointer; font-size:11px; font-family:inherit; transition:background 0.15s; }',
            '.apex-btn:hover { background:#e8e8e8; }',
            '.apex-btn-show { border-color:#2196F3; color:#1565C0; }',
            '.apex-btn-show:hover { background:#E3F2FD; }',
            '.apex-btn-hide { border-color:#f44336; color:#c62828; }',
            '.apex-btn-hide:hover { background:#FFEBEE; }',
            '.apex-btn-flow { border-color:#FF9800; color:#E65100; }',
            '.apex-btn-flow:hover { background:#FFF3E0; }',
            '.apex-btn-wait { border-color:#9E9E9E; color:#424242; }',
            '.apex-btn-play { border-color:#4CAF50; color:#fff; background:#4CAF50; font-weight:600; }',
            '.apex-btn-play:hover { background:#388E3C; }',
            '.apex-btn-step { border-color:#7B1FA2; color:#7B1FA2; }',
            '.apex-btn-step:hover { background:#F3E5F5; }',
            '.apex-btn-stop { border-color:#f44336; color:#fff; background:#f44336; font-weight:600; }',
            '.apex-btn-stop:hover { background:#c62828; }',
            '.apex-btn-apply { border-color:#1565C0; color:#fff; background:#1565C0; font-weight:600; }',
            '.apex-btn-apply:hover { background:#0D47A1; }',
            '.apex-btn-seq { border-color:#00897B; color:#00897B; }',
            '.apex-btn-seq:hover { background:#E0F2F1; }',

            '.apex-anim-settings { display:flex; gap:12px; padding:5px 8px; background:#fafafa; border-bottom:1px solid #eee; align-items:center; }',
            '.apex-anim-settings label { font-size:11px; color:#555; display:flex; align-items:center; gap:4px; }',
            '.apex-anim-settings input[type="number"] { width:60px; padding:2px 4px; border:1px solid #ccc; border-radius:3px; font-size:11px; }',
            '.apex-anim-settings input[type="checkbox"] { margin:0; }',

            '.apex-anim-body { display:flex; flex:1; min-height:0; }',
            '.apex-anim-editor { width:260px; min-width:180px; display:flex; flex-direction:column; border-right:1px solid #ddd; }',
            '.apex-anim-editor textarea { flex:1; resize:none; border:none; padding:8px; font-family:"SF Mono",Menlo,Consolas,monospace; font-size:11px; line-height:1.6; outline:none; background:#1e1e1e; color:#d4d4d4; }',
            '.apex-anim-preview { flex:1; overflow:auto; background:#fff; border:1px solid #eee; }',

            '.apex-anim-status { padding:4px 8px; background:#f4f4f5; border-top:1px solid #ddd; font-size:10px; color:#777; display:flex; justify-content:space-between; }',

            /* Modal dialog styles */
            '.apex-modal-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.4); z-index:10000; display:flex; align-items:center; justify-content:center; }',
            '.apex-modal { background:#fff; border-radius:8px; padding:20px 24px; min-width:340px; box-shadow:0 8px 32px rgba(0,0,0,0.25); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; font-size:13px; }',
            '.apex-modal h3 { margin:0 0 14px 0; font-size:15px; color:#333; }',
            '.apex-modal label { display:flex; align-items:center; gap:8px; margin-bottom:10px; color:#555; font-size:12px; }',
            '.apex-modal input[type="number"] { width:80px; padding:4px 6px; border:1px solid #ccc; border-radius:4px; font-size:12px; }',
            '.apex-modal select { padding:4px 6px; border:1px solid #ccc; border-radius:4px; font-size:12px; }',
            '.apex-modal .apex-modal-info { margin-bottom:12px; padding:8px 10px; background:#f0f7ff; border:1px solid #d0e3f7; border-radius:4px; font-size:11px; color:#1565C0; }',
            '.apex-modal .apex-modal-btns { display:flex; gap:8px; justify-content:flex-end; margin-top:16px; }',
            '.apex-modal .apex-modal-btns button { padding:6px 16px; border:1px solid #ccc; border-radius:4px; font-size:12px; cursor:pointer; font-family:inherit; }',
            '.apex-modal .apex-modal-btns .apex-modal-ok { background:#1565C0; color:#fff; border-color:#1565C0; font-weight:600; }',
            '.apex-modal .apex-modal-btns .apex-modal-ok:hover { background:#0D47A1; }',
            '.apex-modal .apex-modal-btns .apex-modal-cancel { background:#fff; }',
            '.apex-modal .apex-modal-btns .apex-modal-cancel:hover { background:#f0f0f0; }',
        ].join('\n');
        document.getElementsByTagName('head')[0].appendChild(cssEl);
    } catch (e) { /* ignore */ }


    // ==========================================================================
    // 3. CORE ANIMATION ENGINE
    // ==========================================================================


    var allowedToRun = false;
    var running = false;
    var stepMode = false;
    var stepResolve = null;


    function animateCells(graph, cells, steps, delay) {
        graph.executeAnimations(graph.createWipeAnimations(cells, true), null, steps, delay);
    }


    function mapCell(cell, clone, mapping) {
        mapping = mapping || {};
        mapping[cell.id] = clone;
        var childCount = cell.getChildCount();
        for (var i = 0; i < childCount; i++) {
            mapCell(cell.getChildAt(i), clone.getChildAt(i), mapping);
        }
        return mapping;
    }


    function stop() {
        allowedToRun = false;
        stepMode = false;
        if (stepResolve) { stepResolve(); stepResolve = null; }
    }


    /**
     * @param {boolean} keepVisible — If true, skip hiding cells not in the script
     */
    function run(graph, steps, loop, keepVisible, onStep) {
        if (running) return;

        allowedToRun = true;
        running = true;

        // Phase 1: Hide cells
        graph.getModel().beginUpdate();
        try {
            if (keepVisible) {
                var scriptCellIds = {};
                for (var s = 0; s < steps.length; s++) {
                    var t = steps[s].split(' ');
                    if (t.length > 1 && (t[0] === 'show' || t[0] === 'hide' || t[0] === 'flow')) {
                        scriptCellIds[t[1]] = true;
                    }
                }
                var mapping = mapCell(editorUi.editor.graph.getModel().getRoot(), graph.getModel().getRoot());
                for (var sid in scriptCellIds) {
                    var c = mapping[sid];
                    if (c) {
                        graph.setCellStyles('opacity', '0', [c]);
                        graph.setCellStyles('noLabel', '1', [c]);
                    }
                }
            } else {
                var cells = graph.getModel().cells;
                for (var id in cells) {
                    var cell = cells[id];
                    if (graph.getModel().isVertex(cell) || graph.getModel().isEdge(cell)) {
                        graph.setCellStyles('opacity', '0', [cell]);
                        graph.setCellStyles('noLabel', '1', [cell]);
                    }
                }
            }
        } finally {
            graph.getModel().endUpdate();
        }

        var mapping = mapCell(editorUi.editor.graph.getModel().getRoot(), graph.getModel().getRoot());
        var step = 0;

        function next() {
            if (!allowedToRun || step >= steps.length) {
                running = false;
                if (onStep) onStep(-1, steps.length);
                if (loop) {
                    graph.refresh();
                    run(graph, steps, loop, keepVisible, onStep);
                }
                return;
            }

            var line = steps[step].trim();
            var tokens = line.split(' ');

            // Skip empty lines and comments
            if (tokens.length === 0 || tokens[0] === '' || tokens[0].charAt(0) === '#') {
                step++;
                next();
                return;
            }

            if (onStep) onStep(step, steps.length);

            // Step mode: pause and wait for manual advance
            if (stepMode && tokens[0] !== 'wait') {
                new Promise(function (resolve) {
                    stepResolve = resolve;
                }).then(function () {
                    executeCommand(tokens, mapping, graph);
                    step++;
                    next();
                });
                return;
            }

            if (tokens[0] === 'wait' && tokens.length > 1) {
                window.setTimeout(function () {
                    step++;
                    next();
                }, parseFloat(tokens[1]));
                return;
            }

            executeCommand(tokens, mapping, graph);
            step++;
            next();
        }

        next();
    }


    function executeCommand(tokens, mapping, graph) {
        if (tokens.length < 2) return;
        var cell = mapping[tokens[1]];
        if (cell == null) {
            console.log('Apex Animation: cell not found', tokens[1]);
            return;
        }

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
    }


    // ==========================================================================
    // 4. EDGE FLOW ANIMATION
    // ==========================================================================


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
            var isDashed = mxUtils.getValue(state.style, mxConstants.STYLE_DASHED, '0') === '1';

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
    // 5. HELPER: Get cell label for script comments
    // ==========================================================================


    function getCellLabel(cellId) {
        var cells = editorUi.editor.graph.getModel().cells;
        var cell = cells[cellId];
        if (cell) {
            var label = editorUi.editor.graph.getLabel(cell) || '';
            label = label.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            if (label.length > 30) label = label.substring(0, 30) + '...';
            return label;
        }
        return '';
    }


    // ==========================================================================
    // 6. AUTO SEQUENCE: Sort selected cells by numeric ID, generate script
    // ==========================================================================


    /**
     * Extract the leading numeric portion from a cell ID for sorting.
     * Handles IDs like "5", "gs_12", "cell-3", "abc" (no number → Infinity).
     */
    function extractNumber(id) {
        // Try pure numeric first
        if (/^\d+$/.test(id)) return parseInt(id, 10);
        // Try prefix_number pattern (e.g. gs_12)
        var m = id.match(/(\d+)/);
        return m ? parseInt(m[1], 10) : Infinity;
    }


    /**
     * Show the Auto Sequence dialog. The user picks animation style,
     * wait time, and append/replace mode. The selected cells are sorted
     * by their numeric ID and a script is generated.
     */
    function showAutoSequenceDialog(selectedCells, list, defaultWaitMs, statusLeft) {
        if (selectedCells.length === 0) {
            if (statusLeft) statusLeft.textContent = 'No cells selected — select cells on the diagram first';
            return;
        }

        // --- Build modal ---
        var overlay = document.createElement('div');
        overlay.className = 'apex-modal-overlay';

        var modal = document.createElement('div');
        modal.className = 'apex-modal';

        var title = document.createElement('h3');
        title.textContent = 'Auto Sequence';
        modal.appendChild(title);

        // Info box
        var info = document.createElement('div');
        info.className = 'apex-modal-info';
        info.textContent = selectedCells.length + ' cell(s) selected. They will be sorted by numeric ID and animated in order.';
        modal.appendChild(info);

        // Animation style
        var styleLabel = document.createElement('label');
        styleLabel.textContent = 'Animation style: ';
        var styleSelect = document.createElement('select');
        var styles = [
            { value: 'fade', text: 'Fade In' },
            { value: 'wipe', text: 'Wipe In' },
            { value: 'hide', text: 'Fade Out' }
        ];
        for (var i = 0; i < styles.length; i++) {
            var opt = document.createElement('option');
            opt.value = styles[i].value;
            opt.textContent = styles[i].text;
            styleSelect.appendChild(opt);
        }
        styleLabel.appendChild(styleSelect);
        modal.appendChild(styleLabel);

        // Wait time
        var waitLabel = document.createElement('label');
        waitLabel.textContent = 'Wait between cells (ms): ';
        var waitInput = document.createElement('input');
        waitInput.type = 'number';
        waitInput.value = defaultWaitMs;
        waitInput.min = 0;
        waitInput.max = 30000;
        waitInput.step = 50;
        waitLabel.appendChild(waitInput);
        modal.appendChild(waitLabel);

        // Append or replace
        var modeLabel = document.createElement('label');
        modeLabel.textContent = 'Mode: ';
        var modeSelect = document.createElement('select');
        var modes = [
            { value: 'append', text: 'Append to existing script' },
            { value: 'replace', text: 'Replace entire script' }
        ];
        for (var i = 0; i < modes.length; i++) {
            var opt = document.createElement('option');
            opt.value = modes[i].value;
            opt.textContent = modes[i].text;
            modeSelect.appendChild(opt);
        }
        modeLabel.appendChild(modeSelect);
        modal.appendChild(modeLabel);

        // Buttons
        var btns = document.createElement('div');
        btns.className = 'apex-modal-btns';

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'apex-modal-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.onclick = function () { document.body.removeChild(overlay); };

        var okBtn = document.createElement('button');
        okBtn.className = 'apex-modal-ok';
        okBtn.textContent = 'Generate';
        okBtn.onclick = function () {
            var animStyle = styleSelect.value;
            var waitMs = parseInt(waitInput.value) || 0;
            var mode = modeSelect.value;

            // Sort cells by numeric portion of ID
            var sorted = selectedCells.slice().sort(function (a, b) {
                return extractNumber(a.id) - extractNumber(b.id);
            });

            // Build script lines
            var lines = [];
            for (var i = 0; i < sorted.length; i++) {
                var cellId = sorted[i].id;
                var label = getCellLabel(cellId);
                var comment = label ? '  # ' + label : '';

                if (animStyle === 'fade') {
                    lines.push('show ' + cellId + ' fade' + comment);
                } else if (animStyle === 'wipe') {
                    lines.push('show ' + cellId + comment);
                } else if (animStyle === 'hide') {
                    lines.push('hide ' + cellId + comment);
                }

                // Add wait after each cell (except the last if wait is 0)
                if (waitMs > 0) {
                    lines.push('wait ' + waitMs);
                }
            }

            var script = lines.join('\n') + '\n';

            if (mode === 'replace') {
                list.value = script;
            } else {
                // Append — add a blank line separator if there's existing content
                if (list.value.trim().length > 0 && !list.value.endsWith('\n')) {
                    list.value += '\n';
                }
                list.value += script;
            }

            list.scrollTop = list.scrollHeight;

            if (statusLeft) {
                statusLeft.textContent = 'Auto Sequence: ' + sorted.length + ' cells generated (' + animStyle + ', ' + waitMs + 'ms wait)';
            }

            document.body.removeChild(overlay);
        };

        btns.appendChild(cancelBtn);
        btns.appendChild(okBtn);
        modal.appendChild(btns);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Close on overlay click
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) document.body.removeChild(overlay);
        });
    }


    // ==========================================================================
    // 7. APEX ANIMATION WINDOW UI — REDESIGNED
    // ==========================================================================


    var ApexAnimationWindow = function (editorUi, x, y, w, h) {

        var defaultWaitMs = 1000;
        var keepVisibleMode = false;

        // --- Main wrapper ---
        var wrap = document.createElement('div');
        wrap.className = 'apex-anim-wrap';

        // --- Toolbar ---
        var toolbar = document.createElement('div');
        toolbar.className = 'apex-anim-toolbar';

        function makeBtn(label, cssClass, onClick) {
            var btn = document.createElement('button');
            btn.className = 'apex-btn ' + cssClass;
            btn.textContent = label;
            btn.onclick = onClick;
            return btn;
        }

        function makeGroup(labelText, buttons) {
            var g = document.createElement('div');
            g.className = 'apex-group';
            var lbl = document.createElement('span');
            lbl.className = 'apex-group-label';
            lbl.textContent = labelText;
            g.appendChild(lbl);
            for (var i = 0; i < buttons.length; i++) {
                g.appendChild(buttons[i]);
            }
            return g;
        }

        // Animation command buttons
        function addCommand(template) {
            var cells = editorUi.editor.graph.getSelectionCells();
            if (cells.length === 0) return;
            for (var i = 0; i < cells.length; i++) {
                var cmd = template.replace('CELL', cells[i].id);
                var label = getCellLabel(cells[i].id);
                var comment = label ? '  # ' + label : '';
                list.value += cmd + comment + '\n';
            }
            list.value += 'wait ' + defaultWaitMs + '\n';
            list.scrollTop = list.scrollHeight;
        }

        var showGroup = makeGroup('Show', [
            makeBtn('Fade In', 'apex-btn-show', function () { addCommand('show CELL fade'); }),
            makeBtn('Wipe In', 'apex-btn-show', function () { addCommand('show CELL'); })
        ]);

        var hideGroup = makeGroup('Hide', [
            makeBtn('Fade Out', 'apex-btn-hide', function () { addCommand('hide CELL'); })
        ]);

        var flowGroup = makeGroup('Flow', [
            makeBtn('On', 'apex-btn-flow', function () { addCommand('flow CELL start'); }),
            makeBtn('Off', 'apex-btn-flow', function () { addCommand('flow CELL stop'); }),
            makeBtn('Toggle', 'apex-btn-flow', function () { addCommand('flow CELL'); })
        ]);

        var waitGroup = makeGroup('Timing', [
            makeBtn('+ Wait', 'apex-btn-wait', function () {
                list.value += 'wait ' + defaultWaitMs + '\n';
                list.scrollTop = list.scrollHeight;
            })
        ]);

        // NEW: Auto Sequence button group
        var seqGroup = makeGroup('Sequence', [
            makeBtn('Auto Sequence', 'apex-btn-seq', function () {
                var cells = editorUi.editor.graph.getSelectionCells();
                showAutoSequenceDialog(cells, list, defaultWaitMs, statusLeft);
            })
        ]);

        toolbar.appendChild(showGroup);
        toolbar.appendChild(hideGroup);
        toolbar.appendChild(flowGroup);
        toolbar.appendChild(waitGroup);
        toolbar.appendChild(seqGroup);
        wrap.appendChild(toolbar);

        // --- Settings bar ---
        var settings = document.createElement('div');
        settings.className = 'apex-anim-settings';

        // Wait time setting
        var waitLabel = document.createElement('label');
        waitLabel.textContent = 'Default wait (ms): ';
        var waitInput = document.createElement('input');
        waitInput.type = 'number';
        waitInput.value = defaultWaitMs;
        waitInput.min = 50;
        waitInput.max = 10000;
        waitInput.step = 50;
        waitInput.onchange = function () { defaultWaitMs = parseInt(this.value) || 1000; };
        waitLabel.appendChild(waitInput);
        settings.appendChild(waitLabel);

        // Keep visible toggle
        var keepLabel = document.createElement('label');
        var keepCheck = document.createElement('input');
        keepCheck.type = 'checkbox';
        keepCheck.onchange = function () { keepVisibleMode = this.checked; };
        keepLabel.appendChild(keepCheck);
        keepLabel.appendChild(document.createTextNode(' Keep diagram visible (animate selected only)'));
        settings.appendChild(keepLabel);

        wrap.appendChild(settings);

        // --- Body: Editor + Preview ---
        var body = document.createElement('div');
        body.className = 'apex-anim-body';

        // Script editor
        var editorPanel = document.createElement('div');
        editorPanel.className = 'apex-anim-editor';
        var list = document.createElement('textarea');
        list.spellcheck = false;
        list.placeholder = 'Animation script...\n\nSelect cells on the diagram,\nthen click a button above\nto add commands.\n\nAuto Sequence: select multiple\ncells and click "Auto Sequence"\nto generate ordered animation.\n\nOr type manually:\n  show <id> fade\n  show <id>\n  hide <id>\n  flow <id> start\n  wait 1000\n  # comment';
        editorPanel.appendChild(list);
        body.appendChild(editorPanel);

        // Preview container
        var previewPanel = document.createElement('div');
        previewPanel.className = 'apex-anim-preview';
        mxEvent.disableContextMenu(previewPanel);
        body.appendChild(previewPanel);

        wrap.appendChild(body);

        // Load saved script
        var getAnimation = function (cell) {
            return editorUi.editor.graph.getAttributeForCell(cell, 'animation') || '';
        };
        var root = editorUi.editor.graph.getModel().getRoot();
        list.value = getAnimation(root);

        // Preview graph
        var graph = new Graph(previewPanel);
        graph.setEnabled(false);
        graph.setPanning(true);
        graph.foldingEnabled = false;
        graph.panningHandler.ignoreCell = true;
        graph.panningHandler.useLeftButtonForPanning = true;
        graph.minFitScale = null;
        graph.maxFitScale = null;
        graph.centerZoom = true;

        // --- Status bar ---
        var statusBar = document.createElement('div');
        statusBar.className = 'apex-anim-status';
        var statusLeft = document.createElement('span');
        statusLeft.textContent = 'Ready';
        var statusRight = document.createElement('span');
        statusRight.textContent = '';
        statusBar.appendChild(statusLeft);
        statusBar.appendChild(statusRight);
        wrap.appendChild(statusBar);

        // --- Playback controls (bottom toolbar) ---
        var playbar = document.createElement('div');
        playbar.className = 'apex-anim-toolbar';
        playbar.style.borderTop = '1px solid #ddd';
        playbar.style.borderBottom = 'none';

        var playGroup = makeGroup('Playback', [
            makeBtn('▶ Preview', 'apex-btn-play', function () {
                stepMode = false;
                startPreview();
            }),
            makeBtn('⏭ Step', 'apex-btn-step', function () {
                if (!running) {
                    stepMode = true;
                    startPreview();
                } else if (stepResolve) {
                    stepResolve();
                    stepResolve = null;
                }
            }),
            makeBtn('⏹ Stop', 'apex-btn-stop', function () {
                graph.getModel().clear();
                stop();
                statusLeft.textContent = 'Stopped';
            }),
            makeBtn('💾 Apply', 'apex-btn-apply', function () {
                var root = editorUi.editor.graph.getModel().getRoot();
                editorUi.editor.graph.setAttributeForCell(root, 'animation', list.value);
                statusLeft.textContent = 'Script saved to diagram';
            })
        ]);
        playbar.appendChild(playGroup);
        wrap.appendChild(playbar);

        function startPreview() {
            graph.getModel().clear();
            graph.getModel().setRoot(
                graph.cloneCells([editorUi.editor.graph.getModel().getRoot()])[0]
            );
            graph.maxFitScale = 1;
            graph.fit(8);
            graph.center();

            var lines = list.value.split('\n');
            var total = lines.length;
            statusLeft.textContent = 'Playing...';
            statusRight.textContent = '0 / ' + total;

            run(graph, lines, false, keepVisibleMode, function (current, len) {
                if (current === -1) {
                    statusLeft.textContent = 'Finished';
                    statusRight.textContent = total + ' / ' + total;
                } else {
                    statusLeft.textContent = stepMode ? 'Step mode — click Step to advance' : 'Playing...';
                    statusRight.textContent = (current + 1) + ' / ' + len;
                }
            });
        }

        // --- Create the mxWindow ---
        this.window = new mxWindow('Apex Animation', wrap, x, y, w, h, true, true);
        this.window.destroyOnClose = false;
        this.window.setMaximizable(true);
        this.window.setResizable(true);
        this.window.setClosable(true);
        this.window.setVisible(true);

        // Auto-save when switching pages
        var currentRoot = editorUi.editor.graph.getModel().getRoot();
        editorUi.editor.graph.addListener(mxEvent.ROOT, function () {
            var newRoot = editorUi.editor.graph.getModel().getRoot();
            if (newRoot !== currentRoot) {
                if (getAnimation(currentRoot) !== list.value) {
                    editorUi.editor.graph.setAttributeForCell(currentRoot, 'animation', list.value);
                }
                currentRoot = newRoot;
                list.value = getAnimation(currentRoot);
            }
        });
    };


    // ==========================================================================
    // 8. CHROMELESS AUTOSTART
    // ==========================================================================


    if (editorUi.editor.isChromelessView()) {
        function startAnimation() {
            var root = editorUi.editor.graph.getModel().getRoot();
            if (root.value != null && typeof root.value === 'object') {
                var desc = root.value.getAttribute('animation');
                if (desc != null) {
                    run(editorUi.editor.graph, desc.split('\n'), true, false, null);
                    return true;
                }
            }
            return false;
        }
        if (!startAnimation()) {
            editorUi.editor.addListener('fileLoaded', startAnimation);
        }
    }


});