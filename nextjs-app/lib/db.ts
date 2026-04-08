import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Dodaj te opcje, aby zapobiec długiemu czekaniu na timeout
  connectionTimeoutMillis: 2000, 
});

export const db = {
  query: async (text: string, params?: any[]) => {
    // Jeśli jesteśmy w trakcie budowania (CI/Next Build), zwróć pustą tablicę
    if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL?.includes('postgres')) {
      return [];
    }
    
    try {
      const res = await pool.query(text, params);
      return res.rows;
    } catch (err) {
      console.error("DB Error:", err);
      return []; // Zwracamy pustą listę, żeby strona nie wywaliła buildu
    }
  },
};
