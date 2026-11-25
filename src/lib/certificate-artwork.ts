export const certificateArtworkUrl = "/lovable-uploads/7ab347ae-d0be-4f64-ae7e-c4bfd0378ac4.png";
const artwork = `url('${certificateArtworkUrl}')`;

// Crop past the scan's white perimeter, including its uneven side edges.
const bleed = 4;
const width = (794 + 2 * bleed) * 1348 / 1335;
const height = (1123 + 2 * bleed) * 1920 / 1891;
const left = -bleed + (794 + 2 * bleed - width) * 9 / 13;
const top = -bleed + (1123 + 2 * bleed - height) * 23 / 29;

export function certificateArtworkBounds(pageHeight: number) {
  const scale = pageHeight / 1123;
  return { left, top: top * scale, width, height: height * scale };
}

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
