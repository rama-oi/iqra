import "./components/pb_avatar.js"
import "./components/pb_collapse_btn.js"
import "./components/pb_picker.js"
import "./components/pb_clone.js"

import "./components/pb_tabbar.js";
import "./components/pb_toolbar.js";
import "./components/pb_sidebar_left.js";
import "./components/pb_sidebar_right.js";
import "./components/pb_workarea.js";
import "./components/pb_settings.js";

import { initTheme } from "./theme.js";
initTheme();

import { APP } from "./constants/app.js";
document.title = APP.name;
