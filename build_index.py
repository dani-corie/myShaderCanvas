import json
import os

extensions = ('.gif', '.jpeg', '.jpg', '.png', '.webp')

cwd = os.getcwd()
files = os.listdir()
images = [file for file in files if file.lower().endswith(extensions)]

print(json.dumps(images));