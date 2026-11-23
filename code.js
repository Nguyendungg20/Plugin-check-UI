// Design vs UI Diff - plugin sandbox side (no DOM, async node APIs only)
figma.showUI(__html__, { width: 420, height: 720, themeColors: true });

var target = null;
var selfSelectId = null; // id we selected ourselves, ignore its selectionchange
var RED = { r: 1, g: 0x2d / 255, b: 0x55 / 255 };
var BLUE = { r: 13 / 255, g: 153 / 255, b: 1 };
var MAX_CHILDREN = 5000;
var PAINT_TYPES = ['TEXT', 'VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'LINE', 'ELLIPSE', 'POLYGON', 'RECTANGLE'];

function ignoreKey(t) {
  return 'ignore:' + (figma.fileKey || figma.root.name) + ':' + t.id;
}

function paintOp(p) { return p.opacity === undefined ? 1 : p.opacity; }

function visiblePaints(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(function (p) { return p.visible !== false; });
}

function nodeFlags(n) {
  var fills = visiblePaints(n.fills);
  var media = fills.some(function (p) { return p.type === 'IMAGE' || p.type === 'VIDEO' || p.type === 'GIF'; });
  var paints = PAINT_TYPES.indexOf(n.type) >= 0 ||
    fills.some(function (p) { return paintOp(p) > 0; }) ||
    visiblePaints(n.strokes).some(function (p) { return paintOp(p) > 0; });
  var nodeOp = typeof n.opacity === 'number' ? n.opacity : 1;
  var opaque = media || fills.some(function (p) { return p.type === 'SOLID' && paintOp(p) * nodeOp >= 0.95; });
  var solid = fills.filter(function (p) { return p.type === 'SOLID'; }).pop();
  var fill = solid ? { r: solid.color.r, g: solid.color.g, b: solid.color.b, a: paintOp(solid) * nodeOp } : null;
  return { media: media, paints: paints, opaque: opaque, fill: fill };
}

function nodeRadius(n) {
  if (typeof n.cornerRadius === 'number') return n.cornerRadius;
  return typeof n.topLeftRadius === 'number' ? n.topLeftRadius : 0;
}

function post(msg) { figma.ui.postMessage(msg); }
function postError(e) { post({ type: 'error', message: String(e && e.message ? e.message : e) }); }

function nodeInfo(n) {
  return { id: n.id, name: n.name, type: n.type, width: n.width, height: n.height };
}

function postTarget() {
  post({ type: 'target', node: target ? nodeInfo(target) : null });
}

function isInsideMarker(n) {
  var p = n;
  while (p && p.type !== 'PAGE' && p.type !== 'DOCUMENT') {
    if (p.getPluginData && p.getPluginData('diffMarkerFor')) return true;
    p = p.parent;
  }
  return false;
}

function onSelection() {
  var sel = figma.currentPage.selection;
  if (sel.length && selfSelectId === sel[0].id) { selfSelectId = null; return; }
  if (sel.length && isInsideMarker(sel[0])) return;
  target = sel.length ? sel[0] : null;
  postTarget();
}

function selectNode(n) {
  selfSelectId = n.id;
  figma.currentPage.selection = [n];
  figma.viewport.scrollAndZoomIntoView([n]);
}

function parseNodeId(v) {
  v = String(v || '').trim();
  var m = v.match(/node-id=([^&#]+)/);
  if (m) {
    try { v = decodeURIComponent(m[1]); } catch (e) { v = m[1]; }
  }
  return v.replace(/-/g, ':');
}

function requireTarget() {
  if (!target || target.removed) throw new Error('No target node');
  if (!target.absoluteBoundingBox) throw new Error('Target has no bounding box');
  return target;
}

function findMarkers(t) {
  return figma.currentPage.findChildren(function (n) {
    return n.getPluginData('diffMarkerFor') === t.id;
  });
}

function clearMarkers(t) {
  findMarkers(t).forEach(function (n) { n.remove(); });
}

// Depth-first (paint order), pruning hidden subtrees
function collectVisible(node, out) {
  for (var i = 0; i < node.children.length && out.length < MAX_CHILDREN; i++) {
    var c = node.children[i];
    if (!c.visible) continue;
    out.push(c);
    if ('children' in c) collectVisible(c, out);
  }
}

async function doExport(scale) {
  var t = requireTarget();
  var tb = t.absoluteBoundingBox;
  var bytes = await t.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale }, useAbsoluteBounds: true });
  var children = [];
  if ('children' in t) {
    var all = [];
    collectVisible(t, all);
    all.forEach(function (n) {
      var b = n.absoluteBoundingBox;
      if (!b) return;
      var depth = 0, p = n;
      while (p && p.id !== t.id) { depth++; p = p.parent; }
      var fl = nodeFlags(n);
      children.push({
        id: n.id, name: n.name, type: n.type,
        x: b.x - tb.x, y: b.y - tb.y, w: b.width, h: b.height, depth: depth,
        parentId: n.parent && n.parent.id !== t.id ? n.parent.id : null,
        media: fl.media, paints: fl.paints, opaque: fl.opaque, fill: fl.fill, radius: nodeRadius(n),
        text: n.type === 'TEXT' ? n.characters : null,
        fontSize: n.type === 'TEXT' && typeof n.fontSize === 'number' ? n.fontSize : null,
        fontWeight: n.type === 'TEXT' && typeof n.fontWeight === 'number' ? n.fontWeight : null,
        fontStyle: n.type === 'TEXT' && n.fontName !== figma.mixed ? n.fontName.style : null
      });
    });
  }
  post({
    type: 'exported', bytes: bytes, scale: scale,
    node: { id: t.id, name: t.name, width: t.width, height: t.height },
    children: children,
    ignoreIds: (await figma.clientStorage.getAsync(ignoreKey(t))) || []
  });
}

function drawLine(frame, x1, y1, x2, y2, color) {
  var line = figma.createLine();
  frame.appendChild(line);
  var dx = x2 - x1, dy = y2 - y1;
  var length = Math.hypot(dx, dy);
  var cos = dx / length, sin = dy / length;
  line.resize(length, 0);
  line.relativeTransform = [[cos, -sin, x1], [sin, cos, y1]];
  line.strokes = [{ type: 'SOLID', color: color }];
  line.strokeWeight = 2;
}

async function doMark(msg) {
  var t = requireTarget();
  if (t.id !== msg.nodeId) throw new Error('Chọn lại frame đã so sánh để tạo ghi chú.');

  var page = figma.currentPage;
  var font = { family: 'Inter', style: 'Medium' };
  await figma.loadFontAsync(font);
  if (t.removed || figma.currentPage !== page) throw new Error('Mở lại trang chứa frame đã so sánh.');
  var image = figma.createImage(msg.bytes);
  var tb = t.absoluteBoundingBox;
  var previous = findMarkers(t);
  var frame = figma.createFrame();
  try {
    frame.name = 'Actual UI · ' + t.name;
    frame.x = tb.x + tb.width + 80;
    frame.y = tb.y;
    frame.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    frame.clipsContent = false;
    frame.setPluginData('diffMarkerFor', t.id);

    var noteWidth = 300, gutter = 64, padding = 16;
    var shotX = msg.regions.length ? noteWidth + gutter + padding : 0;
    var left = { x: padding, nextY: padding, direction: 1, edge: shotX, bends: 0 };
    var right = { x: shotX + msg.width + gutter, nextY: padding, direction: -1, edge: shotX + msg.width, bends: 0 };
    var shot = figma.createRectangle();
    frame.appendChild(shot);
    shot.name = 'Screenshot · Actual UI';
    shot.x = shotX;
    shot.resize(msg.width, msg.height);
    shot.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];

    var regions = msg.regions.slice().sort(function (a, b) { return a.y - b.y; });
    regions.forEach(function (r) {
      var size = r.kind === 'size';
      var color = size ? BLUE : RED;
      if ((r.kind === 'spacing' || r.kind === 'size') && r.box) {
        var box = figma.createRectangle();
        frame.appendChild(box);
        box.name = (r.kind === 'spacing' ? 'Spacing' : 'Kích thước') + ' · ' + r.index;
        box.x = shotX + r.box.x;
        box.y = r.box.y;
        box.resize(r.box.w, r.box.h);
        box.fills = [{ type: 'SOLID', color: size ? BLUE : { r: 1, g: 0, b: 0 }, opacity: size ? 0.5 : 0.1 }];
      }
      var x = shotX + Math.min(msg.width - 1, Math.max(1, r.x));
      var y = Math.min(msg.height - 1, Math.max(1, r.y));
      var note = figma.createText();
      frame.appendChild(note);
      note.fontName = font;
      note.fontSize = 14;
      note.characters = r.index + '. ' + r.note;
      note.resize(noteWidth, note.height);
      note.textAutoResize = 'HEIGHT';
      note.name = r.note;
      var idealY = y - note.height / 2;
      var side = r.x < msg.width / 2 ? left : right;
      note.x = side.x;
      note.y = Math.max(side.nextY, idealY);
      note.textAlignHorizontal = side === left ? 'RIGHT' : 'LEFT';
      side.nextY = note.y + note.height + padding;

      var startX = side === left ? note.x + noteWidth + 10 : note.x - 10;
      var startY = note.y + note.height / 2;
      if (Math.abs(startY - y) < 0.01) {
        drawLine(frame, startX, y, x, y, color);
      } else {
        var rail = side.edge - side.direction * (14 + 5 * (side.bends++ % 7));
        drawLine(frame, startX, startY, rail, startY, color);
        drawLine(frame, rail, startY, rail, y, color);
        drawLine(frame, rail, y, x, y, color);
      }
      drawLine(frame, x, y, x - 9 * side.direction, y - 5, color);
      drawLine(frame, x, y, x - 9 * side.direction, y + 5, color);
    });
    frame.resize(regions.length ? right.x + noteWidth + padding : msg.width,
      regions.length ? Math.max(msg.height, left.nextY, right.nextY) : msg.height);
  } catch (e) {
    frame.remove();
    throw e;
  }

  previous.forEach(function (n) { if (!n.removed) n.remove(); });
  figma.viewport.scrollAndZoomIntoView([frame]);
  post({ type: 'marked', count: msg.regions.length });
  figma.notify('Đã tạo ' + msg.regions.length + ' ghi chú trên Actual UI');
}

async function focusNode(id) {
  var n = await figma.getNodeByIdAsync(id);
  if (!n || n.type === 'DOCUMENT' || n.type === 'PAGE') throw new Error('Node not found');
  selectNode(n);
}

function focusRegion(m) {
  var t = requireTarget();
  var tb = t.absoluteBoundingBox;
  var ax = tb.x + m.x, ay = tb.y + m.y;
  var vb = figma.viewport.bounds;
  var wantW = Math.max(m.w * 3, 200), wantH = Math.max(m.h * 3, 200);
  var zoom = figma.viewport.zoom * Math.min(vb.width / wantW, vb.height / wantH);
  figma.viewport.center = { x: ax + m.w / 2, y: ay + m.h / 2 };
  figma.viewport.zoom = Math.min(Math.max(zoom, 0.05), 8);
}

async function setNodeId(value) {
  var id = parseNodeId(value);
  var n = await figma.getNodeByIdAsync(id);
  if (!n || n.type === 'DOCUMENT' || n.type === 'PAGE') throw new Error('Node not found: ' + id);
  target = n;
  selectNode(n);
  postTarget();
}

figma.ui.onmessage = async function (msg) {
  try {
    switch (msg.type) {
      case 'set-node-id': await setNodeId(msg.value); break;
      case 'export': await doExport(msg.scale || 2); break;
      case 'mark': await doMark(msg); break;
      case 'clear-marks':
        if (target && !target.removed) clearMarkers(target);
        post({ type: 'cleared' });
        break;
      case 'set-ignore':
        await figma.clientStorage.setAsync(ignoreKey(requireTarget()), msg.ids || []);
        post({ type: 'ignore-saved' });
        break;
      case 'focus-node': await focusNode(msg.nodeId); break;
      case 'focus-region': focusRegion(msg); break;
    }
  } catch (e) {
    postError(e);
  }
};

figma.on('selectionchange', onSelection);
onSelection();
