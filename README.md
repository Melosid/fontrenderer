# Rendering TrueType fonts using WebGPU

## Glossary

### TrueType fonts

Unlike bitmap fonts, which store each character as a rigid pixel grid, TrueType fonts are scalable. This means they use mathematical descriptions to define the shape of each character, or glyph. The outlines of these glyphs are composed of a series of straight lines and quadratic Bézier curves.

### WebGPU

WebGPU is a modern web API that gives web applications access to a computer's Graphics Processing Unit (GPU). WebGPU uses the HTML \<canvas\> element as its rendering target, similar to WebGL.

### Opentype.js

OpenType.js is a JavaScript library for parsing and manipulating font files. It allows you to load font files, read their properties, and perform operations on them directly in the browser or on a server-side environment like Node.js. It's a powerful tool for web developers who want to work with fonts programmatically.

## Steps
- Load the font data using opentype.js and get the vector path data for a charater or text using font.getPath(). 
    - The Path object returned contains an array of commands that define the shape of the text. We iterate over this array and build a list of contours which we will then render on the \<canvas\>.
     - Each contour is an object that contains a triangles array and a curves array. Each triangle is defined by 3 points and each curve is defined by 2 points and 1 control point.

- Render the triangles and curves of each contour in a three pipeline process.
    - First pipeline draws the pixels of each triangle in a per-pixel integer buffer - the stencil buffer. Each time the same pixel is re-drawn the integer value for that pixels inverts i.e 0 to 1 and vice-verca. This helps us to differentiate between fill zones and non-fill zones of a character.
    - Second pipeline draws over the pixels of each triangle where the integer value for that pixel is 1 thus making the rough shape of the character appear on the canvas.
    - Third pipeline draws the curves directly (no stencil testing since the curves don't overlap) to smoothen the character.

- Anti-aliasing using WebGPU's multisampling technique.
