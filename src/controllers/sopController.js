const pool = require("../../config/db");

const getErrorMessage = (error) => {
  if (error?.message) return error.message;
  if (error?.errors?.[0]?.message) return error.errors[0].message;
  return "Database connection failed";
};

const parseJsonField = (value, fallback = []) => {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
};

const normalizeSopRow = (sop) => ({
  ...sop,
  questions: parseJsonField(sop.questions, []),
  frameworks: parseJsonField(sop.frameworks, []),
  tags: parseJsonField(sop.tags, []),
  instruction_steps: parseJsonField(sop.instruction_steps, []),
});

async function fetchSopById(id) {
  const result = await pool.query("SELECT * FROM sops WHERE id = $1 LIMIT 1", [id]);
  return result.rows[0] ? normalizeSopRow(result.rows[0]) : null;
}

async function insertSopRow(values) {
  const result = await pool.query(
    `INSERT INTO sops
      (title, description, category, status, priority, department, estimated_time, script, questions, frameworks, tags, instruction_steps, attachment_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    values,
  );
  const insertId = result.insertId ?? result.rows?.[0]?.id;
  if (!insertId) {
    const err = new Error("SOP insert failed — no id returned");
    err.statusCode = 500;
    throw err;
  }
  const sop = await fetchSopById(insertId);
  if (!sop) {
    const err = new Error("SOP created but could not be loaded");
    err.statusCode = 500;
    throw err;
  }
  return sop;
}

const buildSopValues = (body) => {
  const {
    title,
    description,
    category,
    status,
    priority,
    department,
    estimated_time,
    script,
    questions,
    frameworks,
    tags,
    instruction_steps,
    attachment_url,
  } = body;

  if (!title?.trim()) {
    const err = new Error("Title is required");
    err.statusCode = 400;
    throw err;
  }

  if (!description?.trim()) {
    const err = new Error("Description is required");
    err.statusCode = 400;
    throw err;
  }

  const steps = Array.isArray(instruction_steps)
    ? instruction_steps
        .map((step) => {
          if (typeof step === "string") {
            const title = step.trim();
            return title ? { title } : null;
          }
          const title = String(step?.title || step?.text || "").trim();
          return title ? { step: step?.step, title } : null;
        })
        .filter(Boolean)
    : [];

  if (steps.length === 0) {
    const err = new Error("At least one instruction step is required");
    err.statusCode = 400;
    throw err;
  }

  return [
    title.trim(),
    description.trim(),
    category || "Sales Call",
    status || "Draft",
    priority || "Medium",
    department || "",
    estimated_time || "",
    script?.trim() ? script.trim() : null,
    Array.isArray(questions) ? questions.filter(Boolean) : [],
    Array.isArray(frameworks) ? frameworks.filter(Boolean) : [],
    Array.isArray(tags) ? tags : [],
    steps,
    attachment_url || null,
  ];
};

  // ALL SOPS
  const getAllSops = async (req, res) => {
    try {
      const sopsResult = await pool.query("SELECT * FROM sops ORDER BY id DESC");
      const commentsResult = await pool.query("SELECT * FROM sop_comments ORDER BY created_at ASC");
  
      const sops = sopsResult.rows.map(sop => ({
        ...normalizeSopRow(sop),
        comments: commentsResult.rows
          .filter(c => Number(c.sop_id) === Number(sop.id))
          .map(c => ({
            id:     c.id,
            author: c.author,
            text:   c.text,
            time:   new Date(c.created_at).toLocaleString(),
          })),
      }));

      res.json({ success: true, sops });
    } catch (error) {
      console.error("Error fetching SOPs:", error);
      res.status(500).json({ success: false, message: "Failed to fetch SOPs" });
    }
  };
  // SINGLE SOP DETAILS
  const getSopDetails = (req, res) => {
    const { id } = req.params;
  
    res.json({
      id,
      title: "Code Deployment Pipeline",
      department: "Engineering",
      status: "Active",
      priority: "Critical",
      version: "v4.1",
      owner: "Casey Chen",
      createdDate: "2024-01-20",
  
      description:
        "Engineering deployment SOP covering staging validation, rollback procedures and monitoring.",
  
      steps: [
        "Code Review",
        "QA Validation",
        "Manager Approval",
        "Production Deployment",
        "Monitoring"
      ]
    });
  };
  // CREATE SOP
  const createSop = async (req, res) => {
    try {
      const values = buildSopValues(req.body);

      const sop = await insertSopRow(values);

      res.status(201).json({
        success: true,
        sop,
      });
    } catch (error) {
      console.error("Error creating SOP:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode === 400 ? error.message : "Failed to create SOP",
        error: getErrorMessage(error),
      });
    }
  };
  // UPDATE SOP
  const updateSop = async (req, res) => {
    try {
      const { id } = req.params;
      const values = [...buildSopValues(req.body), id];

      const result = await pool.query(
        `UPDATE sops SET
          title = $1,
          description = $2,
          category = $3,
          status = $4,
          priority = $5,
          department = $6,
          estimated_time = $7,
          script = $8,
          questions = $9,
          frameworks = $10,
          tags = $11,
          instruction_steps = $12,
          attachment_url = $13,
          updated_at = NOW()
         WHERE id = $14`,
        values
      );

      if ((result.rowCount ?? 0) === 0) {
        return res.status(404).json({
          success: false,
          message: "SOP not found",
        });
      }

      const sop = await fetchSopById(id);
      if (!sop) {
        return res.status(500).json({
          success: false,
          message: "SOP updated but could not be loaded",
        });
      }

      res.json({
        success: true,
        sop,
      });
    } catch (error) {
      console.error("Error updating SOP:", error);
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode === 400 ? error.message : "Failed to update SOP",
        error: getErrorMessage(error),
      });
    }
  };  
  // DELETE SOP
  const deleteSop = async (req, res) => {
    try {
      const { id } = req.params;
  
      const result = await pool.query(
        "DELETE FROM sops WHERE id = $1 RETURNING *",
        [id]
      );
  
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "SOP not found",
        });
      }
  
      res.json({
        success: true,
        message: `SOP deleted successfully`,
      });
    } catch (error) {
      console.error("Error deleting SOP:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete SOP",
        error: error.message,
      });
    }
  };
  //duplicate sop
  const duplicateSop = async (req, res) => {
    try {
      const { id } = req.params;
  
      // fetch original
      const original = await pool.query(
        "SELECT * FROM sops WHERE id = $1",
        [id]
      );
  
      if (original.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "SOP not found",
        });
      }
  
      const sop = normalizeSopRow(original.rows[0]);

      const copied = await insertSopRow([
        `${sop.title} (Copy)`,
        sop.description,
        sop.category,
        "Draft",
        sop.priority,
        sop.department,
        sop.estimated_time,
        sop.script,
        sop.questions || [],
        sop.frameworks || [],
        sop.tags || [],
        sop.instruction_steps || [],
        sop.attachment_url,
      ]);

      res.status(201).json({
        success: true,
        sop: copied,
      });
    } catch (error) {
      console.error("Error duplicating SOP:", error);
      res.status(500).json({
        success: false,
        message: "Failed to duplicate SOP",
        error: error.message,
      });
    }
  };
  //add comment
  const addComment = async (req, res) => {
    try {
      const { id } = req.params;
      const { text, author } = req.body;
  
      if (!text?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Comment text is required",
        });
      }
  
      const result = await pool.query(
        `INSERT INTO sop_comments (sop_id, author, text)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [id, author || "Current User", text.trim()]
      );
  
      const comment = result.rows[0];
  
      res.status(201).json({
        success: true,
        comment: {
          id:     comment.id,
          author: comment.author,
          text:   comment.text,
          time:   new Date(comment.created_at).toLocaleString(),
        },
      });
    } catch (error) {
      console.error("Error adding comment:", error);
      res.status(500).json({
        success: false,
        message: "Failed to add comment",
        error: error.message,
      });
    }
  };
  const updateComment = async (req, res) => {
    try {
      const { commentId } = req.params;
      const { text } = req.body;
  
      if (!text?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Comment text is required",
        });
      }
  
      const result = await pool.query(
        `UPDATE sop_comments SET text = $1 WHERE id = $2 RETURNING *`,
        [text.trim(), commentId]
      );
  
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Comment not found",
        });
      }
  
      const comment = result.rows[0];
  
      res.json({
        success: true,
        comment: {
          id:     comment.id,
          author: comment.author,
          text:   comment.text,
          time:   new Date(comment.created_at).toLocaleString(),
        },
      });
    } catch (error) {
      console.error("Error updating comment:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update comment",
        error: error.message,
      });
    }
  };
  
  const deleteComment = async (req, res) => {
    try {
      const { commentId } = req.params;
  
      const result = await pool.query(
        `DELETE FROM sop_comments WHERE id = $1 RETURNING *`,
        [commentId]
      );
  
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Comment not found",
        });
      }
  
      res.json({
        success: true,
        message: "Comment deleted successfully",
      });
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({
        success: false,
        message: "Failed to delete comment",
        error: error.message,
      });
    }
  };
  module.exports = {
   
    getAllSops,
    getSopDetails,
    createSop,
    updateSop,
    deleteSop,
    duplicateSop,
    addComment,
    updateComment,
    deleteComment,
  };