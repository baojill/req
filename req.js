/* req v2.1
 * Copyright (c) 2016, 2017 Eugene Y. Q. Shen.
 *
 * req is free software: you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation, either version
 * 3 of the License, or (at your option) any later version.
 *
 * req is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty
 * of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 */

const CODEFOLDER_URL =              // URL to the folder with subject codes
    "https://raw.githubusercontent.com/eyqs/req/master/data/ubc/2017/codes/";
let c;                              // c = document.getElementById("canvas")
let ctx;                            // ctx = c.getContext("2d")
let pos = {x: 0, y: 0};             // current position of mouse
let button_dict = [];               // button_dict["CPSC 110"] = Button()
let hover_code = "";                // course code that mouse is hovering over
                                    //   "" if mouse is not hovering over any
let mobile_code = "";               // code that mobile user last clicked
                                    //   "" if last click was not on a button
let last_code = "";                 // last value of hover_code or mobile_code
let shade_alpha = 0;                // current alpha of shaded background
let unshade_delay = 0;              // current ticks waited for unshading

let WIDTH;                          // canvas width, set by its width in CSS
const HEIGHT = 1920;                // canvas height
const PADDING = 50;                 // canvas padding
const TOPBARHEIGHT = 440;           // topbar height
const ABTNWIDTH = 120;              // approximate button width
let BTNWIDTH;                       // automatically calculated button width
const BTNHEIGHT = 40;               // button height
const BTNMARGIN = 10;               // margin between buttons
const BLACKLINE = 1;                // normal button border width
const HOVERLINE = 5;                // highlighted button border width
const TOPBARPADDING = 60;           // padding between whole canvas and topbar
const DEPTHSPACING = 20;            // spacing between different depths
const TITLESPACING = 40;            // spacing from top to title

const SHADE_DELTA = 0.001;          // amount to change shade_alpha per tick
const UNSHADE_DELAY = 100;          // ticks to wait before unshading
const MAX_SHADE = 0.5;              // maximum value of shade_alpha
const TOPBAR_COLOUR = "honeydew";   // topbar background colour
const BUTTON_COLOURS = {            // button background colours
  "done": ["greenyellow", " is already taken."],
  "none": ["whitesmoke", " can be taken."],
  "xout": ["lavender", " can be taken"
      + " unless you've taken some credit excluded course outside the tree."],
  "outs": ["wheat", " cannot be taken"
      + " unless you've taken some requisite course outside the tree."],
  "creq": ["gold", " cannot be taken, due to a missing corequisite."],
  "preq": ["pink", " cannot be taken, due to a missing prerequisite."],
  "excl": ["lightsteelblue", " cannot be taken, due to a"
      + " credit excluded course that you've already taken."],
};
const BORDER_COLOURS = {            // button border colours
  "highs": ["black", " is the highlighted course."],
  "preqs": ["deeppink", " is a prerequisite of the highlighted course."],
  "creqs": ["darkorange", " is a corequisite of the highlighted course."],
  "excls": ["indigo", " is credit excluded with the highlighted course."],
  "dreqs": ["olive", " has the highlighted course as a requisite."],
};


// structure for courses is in req.txt

// structure for course buttons

class Button {
  constructor(x, y) {
    Object.assign(this, {x, y});    // coordinates of top left corner
    this.depth = 0;                 // depth down the tree
    this.needs = "none";            // corresponds to button background colour
  }
}


// update mouse position relative to the canvas in the global variable pos

function updateMousePosition(e) {
  const rect = c.getBoundingClientRect();
  const scaleX = c.width / rect.width;
  const scaleY = c.height / rect.height;
  pos = {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };
}


// given a list of lists, return a flat list of all valid course codes in it

function flatten(listlist) {
  const flat_list = [];
  for (const list of listlist) {
    if (list instanceof Array) {
      flat_list.push(...flatten(list));
    } else if (all_courses.hasOwnProperty(list)) {
      flat_list.push(list);
    }
  }
  return flat_list;
}


// given an array of paragraphs of text and a maximum text width,
// return an array of lines of text wrapped under that maximum width

function wrapText(paragraphs, max_width) {
  const lines = [];
  for (const paragraph of paragraphs) {
    let line = "";
    lines.push("");
    for (const word of paragraph.split(' ')) {
      if (ctx.measureText(line + word).width > max_width) {
        lines.push(line.trim());
        line = "";
      }
      line += word + ' ';
    }
    lines.push(line.trim());
  }
  return lines;
}


// given an array of lines of text, a line index, and a maximum text width,
// return an array of lines up to that index, with " ..." appended to the
// last line, possibly with words cut out to fit under that maximum width

function dotText(lines, index, max_width) {
  if (ctx.measureText(lines[index] + " ...").width > max_width) {
    const words = lines[index].split(' ');
    for (let i = words.length; i >= 0; i--) {
      const cut_line = words.slice(0, i).join(' ') + " ...";
      if (ctx.measureText(cut_line).width < max_width) {
        lines[index] = cut_line;
        break;
      }
    }
  }
  return lines.slice(0, index + 1);
}


// given a course code, return an array of paragraphs of text for its topbar

function writeTopbar(code) {
  const paragraphs = [];
  const course = all_courses[code];
  paragraphs.push(course.code);
  if (course.name) {
    paragraphs[0] += ": " + course.name;
  }
  if (course.desc) {
    paragraphs.push(course.desc);
  }
  for (const param of [
      ["Prereqs: ", "preqs", "prer"], ["Coreqs: ", "creqs", "crer"],
      ["Exclusions: ", "excls"], ["Required by: ", "dreqs"],
      ["Terms: ", "terms"], ["Credits: ", "cred"]]) {
    if (course[param[2]]) {
      paragraphs.push(param[0] + course[param[2]]);
    } else if (course[param[1]] && course[param[1]].length > 0) {
      paragraphs.push(param[0] + course[param[1]].join(", "));
    }
  }
  return paragraphs;
}


// draw the topbar and fill it with information about the current course

function drawTopbar() {
  const code = (mobile_code === "") ? hover_code : mobile_code;
  const padded_width = WIDTH - 2 * TOPBARPADDING;
  ctx.textAlign = "start";
  ctx.textBaseline = "top";
  ctx.font = "20px sans-serif";
  let lines;
  if (code === "") {
    lines = ["Welcome to req v2.1.",
        "Please hover over a code to see its course information."];
  } else {
    lines = wrapText(writeTopbar(code), padded_width);
  }

  // calculate actual height of topbar and cut text over the maximum height
  let padded_height = PADDING;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) {
      padded_height += 6;
    }
    padded_height += 6;
    if (padded_height > TOPBARHEIGHT) {
      lines = dotText(lines, i, padded_width);
      break;
    }
  }

  // draw the topbar box
  ctx.lineWidth = BLACKLINE;
  ctx.fillStyle = TOPBAR_COLOUR;
  ctx.fillRect(PADDING, PADDING + TITLESPACING,
      WIDTH - 2 * PADDING, TOPBARHEIGHT);
  ctx.fillStyle = "black";
  ctx.strokeRect(PADDING, PADDING + TITLESPACING,
      WIDTH - 2 * PADDING, TOPBARHEIGHT);

  // draw the topbar text
  let y = 0;
  for (const line of lines) {
    if (line) {
      ctx.fillText(line, TOPBARPADDING, y + TOPBARPADDING + TITLESPACING);
      y += 10;
    }
    y += 10;
  }
}


// decide what to do when user clicks

function onClick(e) {
  updateMousePosition(e);
  const code = getHoverCode(pos);

  // if mouse is hovering over a course, then toggle it
  if (hover_code) {
    toggleDone(hover_code);
    drawApp();
  }

  // if not, yet mouse is clicking on a course, then user must be on mobile
  else if (code) {
    if (code == mobile_chde) {
      toggleDone(hover_code);
      drawApp();
    } else {
      mobile_code = code;
      drawApp();
    }
  }

  // if mouse is neither hovering nor clicking on a course, do not shade tree
  else {
    if (mobile_code !== "") {
      last_code = mobile_code;
    }
    mobile_code = "";
    shade_alpha = 0;
    drawApp();
  }
}


// decide what to do when user moves mouse

function onMouseMove(e) {
  updateMousePosition(e);
  const code = getHoverCode(pos);
  if (code) {
    hover_code = code;
    drawApp();
  } else {
    if (hover_code !== "") {
      last_code = hover_code;
    }
    hover_code = "";
    drawApp();
  }
}


// recursively check whether the given requirements are satisfied

function doneReqs(reqs) {
  if (reqs.length === 0) {
    return "done";
  }

  // recursively push status of each clause into status array
  const statuses = [];
  const operator = reqs[0];
  for (let i = 1; i < reqs.length; i++) {
    if (reqs[i] instanceof Array) {
      statuses.push(doneReqs(reqs[i]));
    }
    // push status of each course in the current tree
    else if (button_dict.hasOwnProperty(reqs[i])) {
      if (button_dict[reqs[i]].needs === "done") {
        statuses.push("done");
      } else {
        statuses.push("none");
      }
    }
    // courses outside the current tree are unknown
    else {
      statuses.push("outs");
    }
  }

  if (operator === "and") {
    if (statuses.indexOf("none") !== -1) {
      return "none";                // any course is none -> none
    } else if (statuses.indexOf("outs") !== -1) {
      return "outs";                // any course is outs -> outs
    } else {
      return "done";                // all courses are done -> done
    }
  } else if (operator === "or") {
    if (statuses.indexOf("done") !== -1) {
      return "done";                // any course is done -> done
    } else if (statuses.indexOf("outs") !== -1) {
      return "outs";                // any course is outs -> outs
    } else {
      return "none";                // all courses are none -> none
    }
  }
}


// return the code that the mouse is currently over, or false if there is none

function getHoverCode() {
  for (const code in button_dict) {
    if (button_dict.hasOwnProperty(code)) {
      const button = button_dict[code];
      if (pos.x > button.x && pos.x < button.x + BTNWIDTH
          && pos.y > button.y && pos.y < button.y + BTNHEIGHT) {
        return code;
      }
    }
  }
  return false;
}


// given a course code, toggle its done status

function toggleDone(code) {
  if (button_dict[code].needs === "done") {
    button_dict[code].needs = "none";
  } else {
    button_dict[code].needs = "done";
  }
  updateCourse(code);
  for (const dependency of all_courses[code].dreqs) {
    if (button_dict.hasOwnProperty(dependency)) {
      updateCourse(dependency);
    }
  }
}


// update the status of the course with the given code

function updateCourse(code) {
  // courses can be taken in onClick -> done
  const button = button_dict[code];
  if (button.needs !== "done") {
    const course = all_courses[code];
    // if any excluded course in the current tree is done -> excl
    if (course.excl.length > 1 && doneReqs(course.excl) === "done") {
      button.needs = "excl";
    // if any prerequisite in the current tree is not done -> preq
    } else if (doneReqs(course.preq) === "none") {
      button.needs = "preq";
    // if any corequisite in the current tree is not done -> creq
    } else if (doneReqs(course.creq) === "none") {
      button.needs = "creq";
    // if all prerequisites are in the current tree and done, and
    //    all corequisites are in the current tree and done, then check...
    } else if (doneReqs(course.preq) === "done"
        && doneReqs(course.creq) === "done") {
      // if all excluded courses are in the current tree and not done -> none
      if (course.excl.length <= 1 || doneReqs(course.excl) === "none") {
        button.needs = "none";
      // otherwise, some excluded course is not in the current tree -> xout
      } else {
        button.needs = "xout";
      }
    // otherwise, some requisite course is not in the current tree -> outs
    } else {
      button.needs = "outs";
    }
  }
}


// draw a single course button on the canvas, with an optional border

function drawButton(code, border_colour) {
  const button = button_dict[code];
  if (!button)
    return;
  ctx.textBaseline = "middle";
  ctx.font = "20px sans-serif";
  ctx.fillStyle = BUTTON_COLOURS[button.needs][0];
  ctx.fillRect(button.x, button.y, BTNWIDTH, BTNHEIGHT);
  if (border_colour) {
    ctx.lineWidth = HOVERLINE;
    ctx.strokeStyle = border_colour;
    ctx.strokeRect(button.x, button.y, BTNWIDTH, BTNHEIGHT);
  } else {
    ctx.lineWidth = BLACKLINE;
    ctx.strokeStyle = "black";
    ctx.strokeRect(button.x, button.y, BTNWIDTH, BTNHEIGHT);
  }
  ctx.fillStyle = "black";
  ctx.fillText(code, button.x + BTNWIDTH / 2, button.y + BTNHEIGHT / 2);
}


// draw the entire application on the canvas
// if hover_code or mobile_code are not blank, then shade it
//   and highlight the courses related to that code too

function drawApp() {
  document.getElementById("canvas").focus();
  ctx.lineWidth = BLACKLINE;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeRect(0, 0, WIDTH, HEIGHT);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText("req v2.1", WIDTH / 2, PADDING);
  ctx.textBaseline = "bottom";
  ctx.font = "12px sans-serif";
  ctx.fillText("Copyright \u00a9 2016, 2017 Eugene Y. Q. Shen.",
      WIDTH / 2, HEIGHT - PADDING);
  for (const code in button_dict) {
    if (button_dict.hasOwnProperty(code)) {
      drawButton(code);
    }
  }
  let shade_code;
  if (hover_code === "" && mobile_code === "") {
    shade_code = last_code;
    if (shade_code === "") {
      drawTopbar();
      return;
    }
    if (unshade_delay > UNSHADE_DELAY) {
      shade_alpha = Math.max(0, shade_alpha - SHADE_DELTA);
    } else {
      unshade_delay++;
    }
    if (shade_alpha > 0) {
      window.requestAnimationFrame(() => drawApp());
    }
  } else {
    shade_code = (mobile_code === "") ? hover_code : mobile_code;
    shade_alpha = Math.min(MAX_SHADE, shade_alpha + SHADE_DELTA);
    if (shade_alpha < MAX_SHADE) {
      window.requestAnimationFrame(() => drawApp());
    } else {
      unshade_delay = 0;
    }
  }
  ctx.fillStyle = `rgba(0, 0, 0, ${shade_alpha})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawButton(shade_code, BORDER_COLOURS["highs"][0]);
  const hover_course = all_courses[shade_code];
  for (const param of ["preqs", "creqs", "excls", "dreqs"]) {
    for (const code of hover_course[param]) {
      drawButton(code, BORDER_COLOURS[param][0]);
    }
  }
  drawTopbar();
}


// update the input course codes with all excluded or dependent courses

function updateCodes(reqlist) {
  const code = document.getElementById("course").value.replace(/\s/g, "")
      .replace(/(^[^\d]*)(\d*)(.*$)/i, "$1 $2").toUpperCase();
  document.getElementById("course").value = "";
  if (all_courses.hasOwnProperty(code)) {
    document.getElementById("courses").value +=
      ", " + code + ", " + all_courses[code][reqlist].join(", ");
  }
}


// update the input course codes with all courses of the given subject

function addSubjectCodes() {
  const dept = document.getElementById("subject").value
      .replace(/\s/g, "").toLowerCase();
  document.getElementById("subject").value = "";
  fetch(CODEFOLDER_URL + dept + ".txt")
    .then((response) => response.text())
    .then(function (subject_codes) {
      document.getElementById("courses").value +=
        ", " + subject_codes.split("\n").join(" ");
    });
}


// parse the input course codes and reposition the buttons on the tree

function parseCodes() {
  // TODO: instead of deleting trailing letters, parse UBC Course Schedule
  /* Remove whitespace, add space before numbers, delete trailing letters,
   * convert to uppercase, and filter out blanks and unknown codes.
   */
  const code_list = document.getElementById("courses").value.split(";").map(
      (list) => list.split(",").map(
      (code) => code.replace(/\s/g, "")
          .replace(/(^[^\d]*)(\d*)(.*$)/i, "$1 $2").toUpperCase()));
  const new_list = code_list[0];
  const done_list = code_list[1];
  const code_dict = {};
  for (const code of new_list) {
    if (code.length > 1 && all_courses.hasOwnProperty(code)) {
      code_dict[code] = true;
    }
  }

  // add all prerequisites and corequisites of all codes, recursively
  const reqlists = ["preqs", "creqs"];
  const checked_dict = {};
  while (Object.keys(checked_dict).length != Object.keys(code_dict).length) {
    for (const code in code_dict) {
      if (code_dict.hasOwnProperty(code)) {
        if (!checked_dict[code]) {
          checked_dict[code] = true;
          for (const reqlist of reqlists) {
            for (const req of all_courses[code][reqlist]) {
              if (all_courses.hasOwnProperty(req)) {
                code_dict[req] = true;
              }
            }
          }
        }
      }
    }
  }

  // create new buttons for each course and mark some as done
  const unordered = {};
  new_button_dict = {};
  for (const code in code_dict) {
    unordered[code] = true;
    new_button_dict[code] = new Button();
    if (button_dict[code] && button_dict[code].needs === "done") {
      new_button_dict[code].needs = "done";
    }
  }
  if (done_list) {
    for (const code of done_list) {
      if (all_courses.hasOwnProperty(code)) {
        unordered[code] = true;
        new_button_dict[code] = new Button();
        new_button_dict[code].needs = "done";
      }
    }
  }
  button_dict = new_button_dict;

  /* Arrange courses in order depending on their depth of prereqs
   * First scan through courses with no preqs and set their depth to 1,
   * then scan through all courses whose preqs all have a non-zero depth
   * of which the maximum is 1, and set their depth to 2, etc. until done.
   */
  let depth = 0;
  while (Object.keys(unordered).length !== 0) {
    depth += 1;
    for (const code in unordered) {
      if (unordered.hasOwnProperty(code)) {
        let haspreq = false;      // has a prereq in the current tree
        let badpreq = false;      // has a prereq with zero or current depth
        let hascreq = false;      // has a coreq in the current tree
        let badcreq = false;      // has a coreq with zero or current depth
        for (const preq of all_courses[code].preqs) {
          if (button_dict.hasOwnProperty(preq)) {
            haspreq = true;
            if (button_dict[preq].depth === 0
                || button_dict[preq].depth === depth) {
              badpreq = true;
            }
          }
        }
        for (const creq of all_courses[code].creqs) {
          if (button_dict.hasOwnProperty(creq)) {
            hascreq = true;
            if (button_dict[creq].depth === 0
                || button_dict[creq].depth === depth + 0.5) {
              badcreq = true;
            }
          }
        }
        if ((depth === 1 && !haspreq && !hascreq)
            || (!badpreq && !badcreq)) {
          button_dict[code].depth = depth;
          delete unordered[code];
        } else if (!badpreq) {
          button_dict[code].depth = depth + 0.5;
        }
      }
    }
    for (const code in unordered) {
      let badcreq = false;        // has a coreq with zero depth
      if (unordered.hasOwnProperty(code)
          && button_dict[code].depth === depth + 0.5) {
        for (const creq of all_courses[code].creqs) {
          if (button_dict.hasOwnProperty(creq)
              && button_dict[creq].depth === 0) {
            badcreq = true;
          }
        }
        if (!badcreq) {
          button_dict[code].depth = depth;
        }
      }
    }
  }

  // find correct coordinates to place each button
  let x = PADDING;
  let y = PADDING + DEPTHSPACING + TITLESPACING + TOPBARHEIGHT;
  for (let d = 0; d <= depth; d++) {
    for (const code in button_dict) {
      if (button_dict.hasOwnProperty(code)) {
        if (button_dict[code].depth === d) {
          Object.assign(button_dict[code], {x, y});
          updateCourse(code);
          x += BTNWIDTH + BTNMARGIN;
          if (x + BTNWIDTH > WIDTH - PADDING) {
            x = PADDING;
            y += BTNHEIGHT + BTNMARGIN;
            if (y + BTNHEIGHT > HEIGHT - PADDING) {
              break;
            }
          }
        }
      }
    }
    if (x === PADDING) {
      y += DEPTHSPACING;
    } else {
      y += BTNHEIGHT + BTNMARGIN + DEPTHSPACING;
    }
    x = PADDING;
    if (y + BTNHEIGHT > HEIGHT - PADDING) {
      break;
    }
  }
}


// start the application

function startApp() {

  // save canvas and context into global variables
  c = document.getElementById("canvas");
  ctx = c.getContext("2d");
  if (!ctx) {
    document.getElementById("nocanvas").innerHTML =
      "Your browser does not support this app!";
  } else {
    // write paragraph on button colours
    const lis = [];
    for (const param of [[BUTTON_COLOURS, "background-color:", " button"],
        [BORDER_COLOURS, "color:", " border"]]) {
      for (needs in param[0]) {
        if (param[0].hasOwnProperty(needs)) {
          lis.push('<li> A course with a <span style="' + param[1]
              + param[0][needs][0] + '">' + param[0][needs][0]
              + param[2] + "</span>" + param[0][needs][1] + "</li>"
          );
        }
      }
    }
    document.getElementById("colours").innerHTML = lis.join("\n");


    // set global variables and add canvas event listeners
    WIDTH = document.getElementById("canvas-wrapper").offsetWidth;
    let btncols = Math.floor((WIDTH - 2 * PADDING) / (ABTNWIDTH + BTNMARGIN));
    BTNWIDTH = Math.floor(
        (WIDTH - 2 * PADDING - (btncols - 1) * BTNMARGIN) / btncols);
    c.width = WIDTH;
    c.height = HEIGHT;
    c.addEventListener("click", onClick, false);
    c.addEventListener("mousemove", onMouseMove, false);

    // update all courses in req.txt with preqs, creqs, and dreqs
    for (const code in all_courses) {
      if (all_courses.hasOwnProperty(code)) {
        const course = all_courses[code];
        for (const param of [["excl", "excls", false],
            ["preq", "preqs", true], ["creq", "creqs", true]]) {
          course[param[1]] = flatten(course[param[0]])
          if (param[2]) {
            for (const dependency of course[param[1]]) {
              if (all_courses.hasOwnProperty(dependency)) {
                all_courses[dependency].ddict[code] = true;
              }
            }
          }
        }
      }
    }
    for (const code in all_courses) {
      if (all_courses.hasOwnProperty(code)) {
        all_courses[code].dreqs = Object.keys(all_courses[code].ddict);
      }
    }
  }
}


// add all event listeners when ready

document.addEventListener("DOMContentLoaded", function () {
  startApp();
  document.getElementById("excls").addEventListener("click",
    () => updateCodes("excls"));
  document.getElementById("dreqs").addEventListener("click",
    () => updateCodes("dreqs"));
  document.getElementById("dept").addEventListener("submit", function (e) {
    e.preventDefault();
    addSubjectCodes();
  });
  document.getElementById("codes").addEventListener("submit", function (e) {
    e.preventDefault();
    parseCodes();
    drawApp();
  });
});
