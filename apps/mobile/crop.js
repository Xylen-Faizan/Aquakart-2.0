const sharp = require('sharp');
const path = require('path');

const imgPath = path.join(__dirname, 'assets', 'images', 'logo.png');
const outPath = path.join(__dirname, 'assets', 'images', 'logo_cropped.png');

async function processImage() {
  try {
    const metadata = await sharp(imgPath).metadata();
    console.log('Original dimensions:', metadata.width, 'x', metadata.height);

    // Crop to the center part (the water drop)
    // Assuming the text is in the outer 25% of the image on all sides
    // Let's crop out the outer 25%
    const cropWidth = Math.floor(metadata.width * 0.5);
    const cropHeight = Math.floor(metadata.height * 0.5);
    const left = Math.floor(metadata.width * 0.25);
    const top = Math.floor(metadata.height * 0.25);

    await sharp(imgPath)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .toFile(outPath);
    
    console.log('Successfully cropped image to', outPath);
  } catch (error) {
    console.error('Error processing image:', error);
  }
}

processImage();
