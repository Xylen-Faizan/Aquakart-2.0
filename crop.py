from PIL import Image

def crop_center_logo():
    img_path = 'apps/mobile/assets/images/logo.png'
    out_path = 'apps/mobile/assets/images/logo_cropped.png'
    
    try:
        with Image.open(img_path) as img:
            width, height = img.size
            print(f"Original size: {width}x{height}")
            
            # The logo text is in a circle around the drop.
            # We want to crop to the center 45% (which should just be the drop)
            left = int(width * 0.275)
            top = int(height * 0.275)
            right = int(width * 0.725)
            bottom = int(height * 0.725)
            
            cropped_img = img.crop((left, top, right, bottom))
            
            # Since the original image might have a transparent background, the crop retains it.
            # Wait, app icons often look better if we resize them to square and fill missing parts with white.
            # We will create a new white background image of the original size and paste the cropped logo in the center.
            # But wait, adaptiveIcon uses #FFFFFF background anyway.
            # Let's just crop and save.
            
            cropped_img.save(out_path)
            print(f"Successfully saved cropped image to {out_path} with size {cropped_img.size}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    crop_center_logo()
