import { AclModel, MorphInterface, RoleInterface } from '../../types.js'
import BaseService from '../base_service.js'
import { BaseModel } from '@adonisjs/lucid/orm'
import {
  // getModelPermissionModelQuery,
  getModelRoleModelQuery,
  // getPermissionModelQuery,
  getRoleModelQuery,
} from '../query_helper.js'

export default class RolesService extends BaseService {
  // private permissionQuery
  // private readonly permissionTable

  private roleQuery
  private readonly roleTable

  // private modelPermissionQuery
  private readonly modelPermissionTable

  private modelRoleQuery
  private readonly modelRoleTable

  constructor(
    private roleClassName: typeof BaseModel,
    // private permissionClassName: typeof BaseModel,
    private modelPermissionClassName: typeof BaseModel,
    private modelRoleClassName: typeof BaseModel,
    private map: MorphInterface
  ) {
    super()
    // this.permissionQuery = getPermissionModelQuery(this.permissionClassName)
    // this.permissionTable = this.permissionClassName.table

    this.roleQuery = getRoleModelQuery(this.roleClassName)
    this.roleTable = this.roleClassName.table

    // this.modelPermissionQuery = getModelPermissionModelQuery(this.modelPermissionClassName)
    this.modelPermissionTable = this.modelPermissionClassName.table

    this.modelRoleQuery = getModelRoleModelQuery(this.modelRoleClassName)
    this.modelRoleTable = this.modelRoleClassName.table
  }

  private modelRolesQuery(modelType: string, modelId: number) {
    return this.roleQuery
      .leftJoin(this.modelRoleTable + ' as mr', 'mr.role_id', '=', this.roleTable + '.id')
      .where('mr.model_type', modelType)
      .where('mr.model_id', modelId)
  }

  all(modelType: string, modelId: number) {
    return this.modelRolesQuery(modelType, modelId)
      .distinct(this.roleTable + '.id')
      .select(this.roleTable + '.*')
  }

  has(modelType: string, modelId: number, role: string | RoleInterface): Promise<boolean> {
    return this.hasAll(modelType, modelId, [role])
  }

  async hasAll(
    modelType: string,
    modelId: number,
    roles: (string | RoleInterface)[]
  ): Promise<boolean> {
    const rolesQuery = this.modelRolesQuery(modelType, modelId)

    let { slugs, ids } = this.formatList(roles)
    if (slugs.length) {
      rolesQuery.whereIn(this.roleTable + '.slug', slugs)
    }

    if (ids.length) {
      rolesQuery.whereIn(this.roleTable + '.id', ids)
    }

    const r = await rolesQuery.count('* as total')

    // @ts-ignore
    return +r[0].$extras.total === roles.length
  }

  async hasAny(
    modelType: string,
    modelId: number,
    roles: (string | RoleInterface)[]
  ): Promise<boolean> {
    // if is string then we are going to check against slug
    // map roles
    const rolesQuery = this.modelRolesQuery(modelType, modelId)

    let { slugs, ids } = this.formatList(roles)
    if (slugs.length) {
      rolesQuery.whereIn(this.roleTable + '.slug', slugs)
    }

    if (ids.length) {
      rolesQuery.whereIn(this.roleTable + '.id', ids)
    }

    const r = await rolesQuery.count('* as total')

    // @ts-ignore
    return +r[0].$extras.total > 0
  }

  assign(role: string | RoleInterface, modelType: string, modelId: number) {
    return this.assignAll([role], modelType, modelId)
  }

  async assignAll(roles: (string | RoleInterface)[], modelType: string, modelId: number) {
    const rs = await this.extractRoleModel(roles)

    if (!rs.length) {
      throw new Error('One or many roles not found')
    }

    let roleIds = rs.map((role) => role.id)

    const modelRoles = await this.modelRoleQuery
      .whereIn('role_id', roleIds)
      .where('model_type', modelType)
      .where('model_id', modelId)
      .select('id')

    const modelRoleIds = modelRoles.map((modelRole) => modelRole.id)

    roleIds = roleIds.filter((roleId) => {
      return !modelRoleIds.includes(roleId)
    })

    const data = []
    for (const id of roleIds) {
      data.push({
        modelType,
        modelId,
        roleId: id,
      })
    }

    await this.modelRoleClassName.createMany(data)

    return true
  }

  async revoke(role: string | number, model: AclModel) {
    return this.revokeAll([role], model)
  }

  async revokeAll(roles: (string | number)[], model: AclModel) {
    const { slugs, ids } = this.formatListStringNumbers(roles)

    await this.modelRoleQuery
      .leftJoin(this.roleTable + ' as r', 'r.id', '=', this.modelRoleTable + '.role_id')
      .where('model_type', this.map.getAlias(model))
      .where('model_id', model.getModelId())
      .where((query) => {
        query.whereIn('r.id', ids).orWhereIn('r.slug', slugs)
      })
      .delete()

    return true
  }

  private async extractRoleModel(roles: (string | RoleInterface)[]) {
    const slugs = []
    const oldRoles = []

    for (const role of roles) {
      if (typeof role === 'string') {
        slugs.push(role)
      } else {
        oldRoles.push(role)
      }
    }

    const newRoles = await this.roleQuery.whereIn('slug', slugs)

    return [...newRoles, ...oldRoles]
  }

  roleModelPermissionQuery(modelType: string) {
    return this.roleQuery
      .leftJoin(this.modelPermissionTable + ' as mp', 'mp.model_id', '=', this.roleTable + '.id')
      .where('mp.model_type', modelType)
  }

  flush(modelType: string, modelId: number) {
    return this.modelRoleQuery.where('model_type', modelType).where('model_id', modelId).delete()
  }
}
