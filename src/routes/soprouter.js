const express = require("express");

const router = express.Router();

const {

  getAllSops,
  getSopDetails,
  createSop,
  updateSop,
  deleteSop,
  duplicateSop,
  addComment,
  updateComment,
  deleteComment,
} = require("../controllers/sopcontroller");





// GET ALL SOPS
router.get("/all", getAllSops);


// GET SINGLE SOP DETAILS
router.get("/details/:id", getSopDetails);


// CREATE SOP
router.post("/create", createSop);


// UPDATE SOP
router.put("/update/:id", updateSop);


// DELETE SOP
router.delete("/delete/:id", deleteSop);

//duplicate sop
router.post("/duplicate/:id", duplicateSop);

//comments
router.post("/:id/comment", addComment);

router.put("/:sopId/comment/:commentId", updateComment);
router.delete("/:sopId/comment/:commentId", deleteComment);
module.exports = router;