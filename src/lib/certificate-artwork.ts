const artwork = "url('/lovable-uploads/7ab347ae-d0be-4f64-ae7e-c4bfd0378ac4.png')";

// Use the artwork's painted bounds so the preview and PDFs line up.
const width = 794 * 1348 / 1335;
const height = 1123 * 1920 / 1891;
const left = (794 - width) * 9 / 13;
const top = (1123 - height) * 23 / 29;

export const certificateArtwork = {
  backgroundImage: artwork,
  backgroundSize: `${width}px ${height}px`,
  backgroundPosition: `${left}px ${top}px`,
  backgroundRepeat: "no-repeat",
};

const logoOffset = 8;
const instituteHeadingTop = 157;
const logoAreaScale = (instituteHeadingTop - logoOffset) / instituteHeadingTop;

// Reposition the logo embedded in the artwork while meeting the original
// background at the institute heading.
export const certificateLogoArtwork = {
  top: logoOffset,
  height: instituteHeadingTop - logoOffset,
  backgroundImage: artwork,
  backgroundSize: `${width}px ${height * logoAreaScale}px`,
  backgroundPosition: `${left}px ${top * logoAreaScale}px`,
  backgroundRepeat: "no-repeat",
};
