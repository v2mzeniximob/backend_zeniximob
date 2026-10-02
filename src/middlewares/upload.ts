import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Cria a pasta "uploads" na raiz do projeto se ela não existir
const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Dá um nome único ao PDF para evitar sobreposição
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `contrato-${uniqueSuffix}.pdf`);
  }
});

export const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limite de 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Apenas ficheiros PDF são permitidos.'));
    }
  }
});