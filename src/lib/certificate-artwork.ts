const artwork = "url('/lovable-uploads/7ab347ae-d0be-4f64-ae7e-c4bfd0378ac4.png')";

// Use the artwork's painted bounds so the preview and PDFs line up.
const width = 794 * 1348 / 1335;
const height = 1123 * 1920 / 1891;
const left = (794 - width) * 9 / 13;
const top = (1123 - height) * 23 / 29;

export function certificateArtworkAtHeight(pageHeight = 1123) {
  const scale = pageHeight / 1123;
  return {
    backgroundImage: artwork,
    backgroundSize: `${width}px ${height * scale}px`,
    backgroundPosition: `${left}px ${top * scale}px`,
    backgroundRepeat: "no-repeat",
  };
}

export const certificateArtwork = certificateArtworkAtHeight();

const logoOffset = 8;
const instituteHeadingTop = 157;
const logoAreaScale = (instituteHeadingTop - logoOffset) / instituteHeadingTop;

// Reposition the logo embedded in the artwork while meeting the original
// background at the institute heading.
export function certificateLogoArtworkAtHeight(pageHeight = 1123) {
  const scale = pageHeight / 1123;
  return {
    top: logoOffset * scale,
    height: (instituteHeadingTop - logoOffset) * scale,
    backgroundImage: artwork,
    backgroundSize: `${width}px ${height * logoAreaScale * scale}px`,
    backgroundPosition: `${left}px ${top * logoAreaScale * scale}px`,
    backgroundRepeat: "no-repeat",
  };
}

export const certificateLogoArtwork = certificateLogoArtworkAtHeight();
