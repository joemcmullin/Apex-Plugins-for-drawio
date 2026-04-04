/**
 * Apex Grayscale Plugin for draw.io
 *
 * Creates a locked grayscale copy of all diagram objects on a layer
 * beneath the originals. Designed to serve as a muted backdrop for
 * progressive animation overlays (e.g. Apex Animation Plugin).
 *
 * Access: Extras → Apex Grayscale...
 */
Draw.loadPlugin(function (editorUi) {

    // ==================================================================
    // 1. MENU REGISTRATION
    // ==================================================================

    mxResources.parse('apexGrayscale=Apex Grayscale...');

    editorUi.actions.addAction('apexGrayscale', function () {
        createGrayscaleLayer(editorUi);
    });

    // Safe menu chaining — preserves any previously registered items
    var menu = editorUi.menus.get('extras');
    var prevFunct_gs = menu.funct;
    menu.funct = function (menu, parent) {
        prevFunct_gs.apply(this, arguments);
        editorUi.menus.addMenuItems(menu, ['-', 'apexGrayscale'], parent);
    };

    // ==================================================================
    // 2. COLOUR CONVERSION UTILITIES
    // ==================================================================

    function hexToRgb(hex) {
        hex = hex.replace(/^#/, '');
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        if (hex.length !== 6) return null;
        var num = parseInt(hex, 16);
        if (isNaN(num)) return null;
        return {
            r: (num >> 16) & 255,
            g: (num >> 8) & 255,
            b: num & 255
        };
    }

    function rgbToHex(r, g, b) {
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b)
            .toString(16).slice(1).toUpperCase();
    }

    function toGrayscale(hexColor, lightenFactor) {
        lightenFactor = (lightenFactor != null) ? lightenFactor : 0.4;
        var rgb = hexToRgb(hexColor);
        if (rgb == null) return hexColor;
        var grey = Math.round(0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
        grey = Math.round(grey + (255 - grey) * lightenFactor);
        grey = Math.min(255, Math.max(0, grey));
        return rgbToHex(grey, grey, grey);
    }

    function grayscaleStyle(style) {
        if (!style || typeof style !== 'string') return style;

        var colorKeys = [
            'fillColor', 'strokeColor', 'fontColor', 'gradientColor',
            'labelBackgroundColor', 'labelBorderColor', 'imageBorder',
            'swimlaneLine', 'separatorColor', 'imageBackground', 'imageBorderColor'
        ];

        var parts = style.split(';');
        var newParts = [];

        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            var eq = part.indexOf('=');
            if (eq > 0) {
                var key = part.substring(0, eq);
                var val = part.substring(eq + 1);
                if (colorKeys.indexOf(key) >= 0 && val.indexOf('#') === 0) {
                    val = toGrayscale(val);
                    newParts.push(key + '=' + val);
                } else {
                    newParts.push(part);
                }
            } else {
                newParts.push(part);
            }
        }

        return newParts.join(';');
    }

    // ==================================================================
    // 3. MAIN FUNCTION
    // ==================================================================

    var LAYER_NAME = 'Apex Grayscale';

    function createGrayscaleLayer(editorUi) {
        var graph = editorUi.editor.graph;
        var model = graph.getModel();
        var root = model.getRoot();

        model.beginUpdate();
        try {
            // Remove existing Apex Grayscale layer if present
            for (var i = 0; i < root.getChildCount(); i++) {
                var layer = root.getChildAt(i);
                var lbl = getLayerLabel(layer);
                if (lbl === LAYER_NAME) {
                    model.remove(layer);
                    break;
                }
            }

            // Find the source layer (first non-grayscale layer)
            var sourceLayer = null;
            for (var i = 0; i < root.getChildCount(); i++) {
                var layer = root.getChildAt(i);
                if (getLayerLabel(layer) !== LAYER_NAME) {
                    sourceLayer = layer;
                    break;
                }
            }

            if (sourceLayer == null) {
                mxUtils.alert('No source layer found.');
                return;
            }

            // Create new grayscale layer
            var newLayer = new mxCell();
            var doc = mxUtils.createXmlDocument();
            var node = doc.createElement('object');
            node.setAttribute('label', LAYER_NAME);
            newLayer.setValue(node);
            newLayer.setVisible(true);
            newLayer.setCollapsed(false);

            // Insert at index 0 = bottom of the layer stack
            model.add(root, newLayer, 0);

            // Clone all cells with grayscale conversion
            var childCount = sourceLayer.getChildCount();
            for (var i = 0; i < childCount; i++) {
                cloneCellToLayer(model, graph, sourceLayer.getChildAt(i), newLayer);
            }

            // Lock the layer
            var layerStyle = newLayer.style || '';
            if (layerStyle.indexOf('locked=1') < 0) {
                newLayer.style = (layerStyle ? layerStyle + ';' : '') + 'locked=1';
            }

        } finally {
            model.endUpdate();
        }

        graph.refresh();
    }

    // ==================================================================
    // 4. RECURSIVE CELL CLONER
    // ==================================================================

    function cloneCellToLayer(model, graph, cell, targetParent) {
        var clone = cell.clone();

        clone.style = grayscaleStyle(clone.style);

        var s = clone.style || '';
        s = s.replace(/;?opacity=[^;]*/g, '');
        clone.style = s + ';opacity=60';

        if (cell.geometry != null) {
            clone.geometry = cell.geometry.clone();
        }

        clone.id = 'gs_' + cell.id;

        model.add(targetParent, clone);

        if (model.isEdge(cell)) {
            if (cell.source) {
                var srcClone = model.cells['gs_' + cell.source.id];
                if (srcClone) model.setTerminal(clone, srcClone, true);
            }
            if (cell.target) {
                var tgtClone = model.cells['gs_' + cell.target.id];
                if (tgtClone) model.setTerminal(clone, tgtClone, false);
            }
        }

        for (var i = 0; i < cell.getChildCount(); i++) {
            cloneCellToLayer(model, graph, cell.getChildAt(i), clone);
        }
    }

    // ==================================================================
    // 5. UTILITY
    // ==================================================================

    function getLayerLabel(layer) {
        if (layer.value && typeof layer.value === 'object') {
            return layer.value.getAttribute('label') || '';
        }
        return (typeof layer.value === 'string') ? layer.value : '';
    }

});