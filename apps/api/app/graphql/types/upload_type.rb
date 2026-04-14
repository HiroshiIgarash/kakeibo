# apps/api/app/graphql/types/upload_type.rb

module Types
  class UploadType < Types::BaseScalar
    description "ファイルアップロード用のScalar型"

    def self.coerce_input(value, _context)
      value
    end

    def self.coerce_result(value, _context)
      raise GraphQL::CoercionError, "Upload型はレスポンスに使用できません"
    end
  end
end
