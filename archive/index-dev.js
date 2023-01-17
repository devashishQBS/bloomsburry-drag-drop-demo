"use strict";

const D_CONTAINER_ATTR = "data-draggable-container";
const DRAG_BOX_ATTR = "data-draggable";
const DROP_ZONE_ATTR = "data-dropzone";
const DRAGGING_BOX_ATTR = "data-dragging-box"; // will be created dynamically by script
const SCROLL_ZONEs_ATTR = "data-scrolling-zone";
const MOVE_BY = 20; // used with keyboard move
const SCROLL_ZONE_HEIGHT = 80;

let box_to_drag = null;
let box_is_focused = false;
let box_is_selected = false;
let box_mouse_selected = false;

let dragging_box = null;
let dragging_box_info = {
  container: null,
  boundary: null,
};

let dragging_from = null;
let drop_zones = [];
let scroll_zones = [];

const K_CODES = { 38: "N", 40: "S", 39: "E", 37: "W" }; // Key codes

// initaial - Box and Mouse/Touch-point coordinates and difference between both.
let imouse = { x: null, y: null, bx: null, by: null, dx: null, dy: null };
let mouse_last_coords = { x: 0, y: 0 };
let last_event = null;

/*





UTILITY FUNCTIONS





*/

function select(str, bool) {
  return bool ? document.querySelectorAll(str) : document.querySelector(str);
}
function createDomElement(tag, { attrs = {}, styles = {} }) {
  try {
    const e = document.createElement(tag);

    for (const prop in attrs) e.setAttribute(prop, attrs[prop]);
    for (const prop in styles) e.style.setProperty(prop, attrs[prop]);
    return e;
  } catch (err) {
    return err;
  }
}
function style(el, styles) {
  if (el) Object.assign(el.style, styles);
}
function attrs(el, attrs) {
  for (let [K, V] of Object.entries(attrs)) el.setAttribute(K, V);
}
function boundRectOf(el) {
  return el?.getBoundingClientRect();
}
function elementInsideDropbox(element, dropzones) {
  if (!element) return;

  const el = boundRectOf(element);

  const el_centerY = el.top + el.height / 2;
  const el_centerX = el.left + el.width / 2;

  let dropbox = null;
  dropzones.forEach((b) => {
    const box = boundRectOf(b);
    if (
      el_centerY >= box.top &&
      el_centerY <= box.bottom &&
      el_centerX >= box.left &&
      el_centerX <= box.right
    )
      dropbox = b;
  });
  return dropbox;
}
function pointerInsideDropbox(event, dropzones) {
  let { x: mx, y: my } = mouse_last_coords;

  let dropbox = null;

  dropzones.forEach((b) => {
    let { top, bottom, left, right } = boundRectOf(b); // dropbox coords
    if (my >= top && my <= bottom && mx >= left && mx <= right) dropbox = b;
  });
  return dropbox;
}
function draggable_styles({ x, y, width, height }) {
  x += window.scrollX;
  y += window.scrollY;

  return {
    position: "absolute",
    width: width + "px",
    height: height + "px",
    top: y + "px",
    left: x + "px",
    boxShadow: "0 0 10px #00000080",
    outline: "1px solid gray",
    zIndex: 999,
    userSelect: "none",
    textAlign: "center",
    cursor: "move",
    scale: 1.05,
  };
}
function onDocument(events, handler) {
  events
    .split(" ")
    .forEach((e) => document.addEventListener(e, handler, { passive: false }));
  // { passive: false } to prevent swipe down reload gesture in mobile phones
}
function init_imouse($x, $y, x, y) {
  // Coordinates |x, y|:pointers , |bx, by|:boxToDrag, |dx, dy|:identify_mouse_loc_on_boxToDrag
  return { x: $x, y: $y, bx: x, by: y, dx: $x - x, dy: $y - y };
}
function isElementInViewport(el) {
  var rect = el.getBoundingClientRect();

  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.left <
      (window.innerWidth ||
        document.documentElement.clientWidth) /* or $(window).width() */ &&
    rect.top <
      (window.innerHeight ||
        document.documentElement.clientHeight) /* or $(window).height() */
  );
}
function keepInViewport(el) {
  if (!isElementInViewport(el))
    el.scrollIntoView({ block: "center", behavior: "smooth" });
}
function addTabIndexToAllBoxes(attribute) {
  select(`[${attribute}]`, true).forEach((box) => attrs(box, { tabindex: 0 }));
}
function removeTabIndexFromAllBoxes(attribute) {
  select(`[${attribute}]`, true).forEach((box) => attrs(box, { tabindex: "" }));
}
function removeScrollZones(scroll_zones) {
  scroll_zones.forEach((zone) => zone.remove());
}

function scrollOnScrollZone(e) {
  // SCROLL WHEN NEAR TO TOP-BOTTOM ENDS
  if (box_is_selected) {
    const viewportHeight = window.innerHeight;
    let cursorPosition = mouse_last_coords.y;

    const scrollAmount = 10;
    const box_top = parseInt(dragging_box.style.top);

    if (cursorPosition < 80 && window.pageYOffset) {
      window.scrollBy(0, -scrollAmount);
      style(dragging_box, { top: box_top - scrollAmount + "px" });
    } //
    else if (cursorPosition > viewportHeight - 80) {
      window.scrollBy(0, scrollAmount);
      style(dragging_box, { top: box_top + scrollAmount + "px" });
    }

    window.requestAnimationFrame(() => scrollOnScrollZone(e));
  }
}

/* 






MOUSE AND TOUCH EVENTS 






*/

addTabIndexToAllBoxes(DRAG_BOX_ATTR);

// Handle Mouse Down / Touch Down
onDocument("mousedown touchstart", (e) => {
  const target = e.target.hasAttribute(DRAG_BOX_ATTR)
    ? e.target
    : e.target.closest(`[${DRAG_BOX_ATTR}]`);

  if (!target || box_is_selected) return;

  e.preventDefault(); // otherwise mozilla selects textContent
  // document.body.style.MozUserSelect="none" // Another option

  box_to_drag = target;

  dragging_from = box_to_drag?.parentElement;

  box_is_focused = true;
  box_is_selected = true;

  const { x, y } = boundRectOf(box_to_drag);

  mouse_last_coords = { x: e.clientX, y: e.clientY };

  if (e.type === "touchstart") {
    let touch = e.targetTouches[0];
    // imouse = init_imouse(touch.pageX, touch.pageY, x, y);
    imouse = init_imouse(touch.clientX, touch.clientY, x, y);
    mouse_last_coords = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  } //
  else imouse = init_imouse(e.clientX, e.clientY, x, y);

  box_mouse_selected = true;

  // Generate element to drag
  make_draggable_element();

  // identify dropzones
  drop_zones = [...select(`[${DROP_ZONE_ATTR}]`, 1)];

  window.requestAnimationFrame(() => scrollOnScrollZone(e));
});

// Handle Mouse Up / Touch Up
onDocument("mouseup touchend", (e) => {
  const target = e.target.closest(`[${DRAGGING_BOX_ATTR}]`) ?? e.target;

  // prevents dropping outside of document
  if (e.type !== "touchend" && target !== dragging_box) {
    return remove_draggable_element(false);
  }

  // Drop and Remove the Selected Box

  // let dropbox = elementInsideDropbox(dragging_box, drop_zones);
  if (box_is_selected) var dropbox = pointerInsideDropbox(e, drop_zones);

  // drop if dropping inside a dropzone
  if (dropbox) drop_draggable_element(dropbox);

  box_mouse_selected = false;
  mouse_last_coords = { x: 0, y: 0 };

  //remove pseudo draggable element
  remove_draggable_element(!!dropbox);
});

// Handle Mouse Move / Touch Move
onDocument("mousemove touchmove", (e) => {
  if (!box_is_selected || !box_mouse_selected) return;

  // prevent loading on mobile devices
  e.preventDefault();

  // calculate: how much to move
  let mdx, mdy;
  let mouse_coords = { x: 0, y: 0 };
  let box_y = 0;
  if (e.type === "touchmove") {
    var touch = e.targetTouches[0];

    mdx = touch.clientX - imouse.x;
    mdy = touch.clientY - imouse.y;

    mouse_coords = { x: touch.clientX, y: touch.clientY };
  }
  // if mouse-move
  else {
    mdx = e.clientX - imouse.x;
    mdy = e.clientY - imouse.y;
    mouse_coords = { x: e.clientX, y: e.clientY };

    // correction for dev
    // mdx = scrollX + e.clientX - imouse.x;
    // mdy = scrollY + e.clientY - imouse.y;
  }

  const mouse_direction = {
    x: mouse_coords.x - mouse_last_coords.x,
    y: mouse_coords.y - mouse_last_coords.y,
  };

  mouse_last_coords = { ...mouse_coords };

  let top = window.scrollY + imouse.y + mdy - imouse.dy;
  let left = window.scrollX + imouse.x + mdx - imouse.dx;

  const { minX, minY, maxX, maxY } = dragging_box_info.boundary;
  const { width, height } = boundRectOf(dragging_box);

  if (mdy > 0) top = Math.min(top, maxY - height);
  else if (mdy < 0) top = Math.max(top, minY);

  if (mdx > 0) left = Math.min(left, maxX - width);
  else if (mdx < 0) left = Math.max(left, minX);

  // Move Effect
  style(dragging_box, {
    top: top + "px",
    left: left + "px",

    // correction for dev
    // top: imouse.y + mdy - imouse.dy + "px",
    // left: imouse.x + mdx - imouse.dx + "px",
  });
});

//
/* 





KEYBOARD KEY EVENTS : ACCESSIBILTY





*/

// Handle Tab & Space Key
onDocument("keyup", (e) => {
  if (e.key !== "Tab") return true;

  // if Tab Key, make a Box selectable

  // Don't select any other elements if already picked an element
  if (box_is_selected) return e.preventDefault();

  box_is_focused = document.activeElement.hasAttribute(DRAG_BOX_ATTR);
  if (box_is_focused) box_to_drag = document.activeElement;
});

// Handle Key Down of Space Key & Arrow Keys
onDocument("keydown", (e) => {
  //   if (e.key === "Tab" && box_is_selected) return e.preventDefault();

  const direction = K_CODES[e.keyCode]; // N, S, E, W

  // Mark as selected
  if (e.key === " " && box_is_focused) {
    e.preventDefault();
    if (box_mouse_selected) return true;

    if (box_is_selected) {
      // DROP THE BOX
      let dropbox = elementInsideDropbox(dragging_box, drop_zones);

      const dropzone_is_focused =
        document.activeElement.hasAttribute(DROP_ZONE_ATTR);

      if (dropzone_is_focused) dropbox = document.activeElement;

      // drop if over a dropzone OR dropzone is active
      if (dropbox) drop_draggable_element(dropbox);

      remove_draggable_element(!!dropbox); // remove pseudo draggable element
    } else {
      // PICK THE BOX
      box_is_selected = true; // Mark as selected

      // Set for go-back animation
      const { x, y } = boundRectOf(box_to_drag);
      imouse = init_imouse(x, y, x, y);

      keepInViewport(box_to_drag);
    }
  }
  // Move generated draggable element
  else if (!box_mouse_selected && direction) {
    if (!dragging_box) return true;

    e.preventDefault();
    keepInViewport(dragging_box);

    const prev_y = +dragging_box.style.top.replace("px", "");
    const prev_x = +dragging_box.style.left.replace("px", "");

    switch (direction) {
      case "N":
        style(dragging_box, { top: prev_y - MOVE_BY + "px" }); // y - 20 + px
        break;
      case "S":
        style(dragging_box, { top: prev_y + MOVE_BY + "px" });
        break;
      case "E":
        style(dragging_box, { left: prev_x + MOVE_BY + "px" }); // x + 20 + px
        break;
      case "W":
        style(dragging_box, { left: prev_x - MOVE_BY + "px" });
        break;
      default:
        break;
    }
  } else return;

  // Generate a draggable element
  // and identify dropzones
  if (box_is_selected) {
    dragging_from = box_to_drag?.parentElement;
    make_draggable_element();
    drop_zones = [...select(`[${DROP_ZONE_ATTR}]`, 1)];
  }
});

/*





FUNCTIONS 





*/

function make_draggable_element() {
  if (dragging_box) return; // Do nothing if a draggable already present

  // Making new node for dragging
  dragging_box = box_to_drag.cloneNode(true);

  // Making Scroll Zones
  const scroll_zone_top = createDomElement("div", {
    attrs: { "data-scrolling-zone": "", class: "scroll-top" },
  });
  const scroll_zone_bottom = createDomElement("div", {
    attrs: { "data-scrolling-zone": "", class: "scroll-bottom" },
  });

  scroll_zones = [scroll_zone_top, scroll_zone_bottom];

  const dragables_container = box_to_drag.closest(`[${D_CONTAINER_ATTR}]`);
  // Calculate boundaries
  const {
    top: minY,
    bottom: maxY,
    left: minX,
    right: maxX,
  } = boundRectOf(dragables_container);

  dragging_box_info = {
    container: dragables_container,
    boundary: {
      minX: minX + scrollX + 10, // 17 = scrollbar width
      minY: minY + scrollY + 5,
      maxX: maxX + scrollX + 7,
      maxY: maxY + scrollY,
    },
  };

  // Hide Original element until dragging
  style(box_to_drag, { opacity: 0 });

  dragging_box.removeAttribute(DRAG_BOX_ATTR);
  attrs(dragging_box, { [DRAGGING_BOX_ATTR]: "" });
  style(dragging_box, draggable_styles(boundRectOf(box_to_drag)));

  select("body").append(dragging_box, ...scroll_zones);

  removeTabIndexFromAllBoxes(DRAG_BOX_ATTR);
  addTabIndexToAllBoxes(DROP_ZONE_ATTR);
}

function drop_draggable_element(dropbox) {
  const newBox = box_to_drag.cloneNode(true);

  dropbox.appendChild(newBox);

  dropbox.removeAttribute(DROP_ZONE_ATTR);
  dropbox.removeAttribute("tabindex");

  attrs(dragging_from, { [DROP_ZONE_ATTR]: "", tabindex: 0 });

  removeScrollZones(scroll_zones);
  box_to_drag.remove();
  box_to_drag = newBox;
  box_to_drag.focus();
}

function remove_draggable_element(drop_is_success) {
  box_is_selected = false;

  if (!dragging_box) return;

  let transition_duration = 0;

  //   if (!drop_is_success) {
  const { x: X, y: Y } = boundRectOf(dragging_box);
  const { x: bx, y: by } = boundRectOf(box_to_drag);

  const dx = Math.abs(X - bx);
  const dy = Math.abs(Y - by);

  if (Math.max(dx, dy) > 200) transition_duration = 0.3;

  keepInViewport(box_to_drag);

  style(dragging_box, {
    transition: `${transition_duration}s linear`,
    top: window.scrollY + by + "px",
    left: window.scrollX + bx + "px",
  });
  //   }

  removeScrollZones(scroll_zones);
  setTimeout(() => {
    style(box_to_drag, { opacity: 1 });
    box_to_drag.focus();

    // box_is_selected = false;
    dragging_box?.remove();
    dragging_box = null;

    dragging_box_info = {
      container: null,
      boundary: null,
    };

    keepInViewport(box_to_drag);
  }, transition_duration * 1000);

  addTabIndexToAllBoxes(DRAG_BOX_ATTR);
  removeTabIndexFromAllBoxes(DROP_ZONE_ATTR);
}
