const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// --- CONFIGURACIÓN ---
const MONGO_URI = "mongodb+srv://jhonatandavidcastrogalviz_db_user:78simon87@cluster0.bohtlpq.mongodb.net/FashionCraftDB?retryWrites=true&w=majority";
const JWT_SECRET = "78simon87_fashion_secret_key_2026"; // Firma para tokens

// --- CONEXIÓN A BASE DE DATOS ---
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas - App de Confecciones"))
  .catch(err => console.error("❌ Error de conexión:", err));

// --- MODELOS DE DATOS ---

// Usuario (Sastre/Taller)
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  nombreTaller: String,
  fontSize: { type: Number, default: 16 } // Preferencia de tamaño de letra
});

// Orden de Trabajo (La "Card")
const OrderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Aislamiento de datos
  cliente: {
    nombre: String,
    telefono: String
  },
  prenda: {
    tipo: String,
    medidas: Object, // Tallas exactas (JSON flexible)
    descripcion: String, // Especificaciones: costuras, hilos, etc.
    previsualizacion: String // URL de imagen o boceto
  },
  gestion: {
    valor: Number,
    estado: { type: String, enum: ['Pendiente', 'Proceso', 'Finalizado'], default: 'Pendiente' },
    fechaIngreso: { type: Date, default: Date.now }
  }
});

const User = mongoose.model('User', UserSchema);
const Order = mongoose.model('Order', OrderSchema);

// --- MIDDLEWARE DE SEGURIDAD ---
const auth = (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ msg: 'Acceso denegado. No hay token.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    res.status(400).json({ msg: 'Token no es válido' });
  }
};

// --- RUTAS DE AUTENTICACIÓN ---

// Registro de nuevo sastre
app.post('/api/auth/register', async (req, res) => {
  const { email, password, nombreTaller } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'El usuario ya existe' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({ email, password: hashedPassword, nombreTaller });
    await user.save();
    res.json({ msg: "Usuario registrado con éxito" });
  } catch (err) { res.status(500).send('Error en servidor'); }
});

// Login con sesión persistente (7 días)
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Credenciales inválidas' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Contraseña incorrecta' });

    // El token dura 7 días para que no se cierre la sesión al salir
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ 
      token, 
      user: { id: user._id, nombre: user.nombreTaller, fontSize: user.fontSize } 
    });
  } catch (err) { res.status(500).send('Error en servidor'); }
});

// --- RUTAS DE ÓRDENES (GRID / CARDS) ---

// Obtener todas las órdenes de EL usuario logueado (Buscador integrado)
app.get('/api/orders', auth, async (req, res) => {
  const { search } = req.query;
  let query = { userId: req.user.id };
  
  if (search) {
    query["cliente.nombre"] = { $regex: search, $options: 'i' }; // Buscador por nombre
  }

  try {
    const orders = await Order.find(query).sort({ 'gestion.fechaIngreso': -1 });
    res.json(orders);
  } catch (err) { res.status(500).send('Error al obtener órdenes'); }
});

// Crear nueva orden (Agregar contenido)
app.post('/api/orders', auth, async (req, res) => {
  try {
    const newOrder = new Order({
      ...req.body,
      userId: req.user.id
    });
    const order = await newOrder.save();
    res.json(order);
  } catch (err) { res.status(500).send('Error al guardar'); }
});

// Actualizar o Finalizar trabajo (Para generar factura después)
app.put('/api/orders/:id', auth, async (req, res) => {
  try {
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { $set: req.body },
      { new: true }
    );
    res.json(order);
  } catch (err) { res.status(500).send('Error al actualizar'); }
});

// Eliminar contenido
app.delete('/api/orders/:id', auth, async (req, res) => {
  try {
    await Order.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    res.json({ msg: 'Orden eliminada correctamente' });
  } catch (err) { res.status(500).send('Error al eliminar'); }
});

// --- RUTA PARA FACTURA (RESUMEN) ---
app.get('/api/orders/:id/invoice', auth, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, userId: req.user.id });
    if (!order) return res.status(404).json({ msg: 'No encontrada' });
    
    // Aquí devuelves la data lista para el PDF en el frontend
    res.json({
      taller: "Información de tu taller",
      cliente: order.cliente,
      trabajo: order.prenda,
      total: order.gestion.valor,
      fecha: order.gestion.fechaIngreso
    });
  } catch (err) { res.status(500).send('Error al procesar factura'); }
});

// --- INICIO DEL SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor en ejecución en puerto ${PORT}`));
