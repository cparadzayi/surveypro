/**
 * Attach `control_points` / `control_point_ids` to a list of survey projects with ONE query.
 *
 * The project list used to ask for each project's control points separately, so a surveyor with
 * N projects cost 1 + N transactions (each 4 round-trips) per page load. Under 60 simultaneous
 * list calls that was most of the 1.8 s median measured in the user simulation.
 *
 * @param {{query: Function}} dbConnection  schema-scoped connection (see getSurveyorPool)
 * @param {Array<{id: number}>} projects    mutated in place
 */
export async function attachControlPoints(dbConnection, projects) {
  for (const p of projects) {
    p.control_points = []
    p.control_point_ids = []
  }
  if (projects.length === 0) return projects

  const { rows } = await dbConnection.query(
    `SELECT pcp.project_id, cp.id, cp.monu_num, cp.monu_name, pcp.point_order
       FROM project_control_points pcp
       JOIN public.zim_control_points cp ON pcp.control_point_id = cp.id
      WHERE pcp.project_id = ANY($1)
      ORDER BY pcp.project_id, pcp.point_order`,
    [projects.map((p) => p.id)]
  )

  const byProject = new Map(projects.map((p) => [p.id, p]))
  for (const { project_id, ...point } of rows) {
    const project = byProject.get(project_id)
    if (!project) continue
    project.control_points.push(point)
    project.control_point_ids.push(point.id)
  }
  return projects
}
