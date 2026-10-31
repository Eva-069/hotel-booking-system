// Єдина точка контролю доступу (ADR-03, розділ 2.1 — «Архітектурні рішення»).
// Кожен захищений маршрут проходить через requireAuth (перевірка токена),
// а там, де потрібно обмежити дію роллю — додатково через requireRole(...).
// Це саме те «централізоване» рішення з ADR-03: перевірка не дублюється
// в кожному обробнику маршруту окремо.

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "course-project-dev-secret-change-me";

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ code: "unauthorized", message: "Відсутній токен автентифікації" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { sub, role, fullName }
    next();
  } catch (err) {
    return res.status(401).json({ code: "unauthorized", message: "Недійсний або прострочений токен" });
  }
}

// Відповідає позначкам x-roles у openapi.yaml для кожної операції.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        code: "forbidden",
        message: `Дія доступна лише ролі: ${roles.join(", ")}`,
      });
    }
    next();
  };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, fullName: user.full_name },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
}

module.exports = { requireAuth, requireRole, signToken, JWT_SECRET };
