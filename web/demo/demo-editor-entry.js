// Runs in the editor iframe before the editor bundle (see vendor/build-editor.py).
import { installFromParent } from './demo-editor-frame.js';

installFromParent(window);
