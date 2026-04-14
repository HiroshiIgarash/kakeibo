# frozen_string_literal: true

class Dataloaders::ChildrenByParentId < GraphQL::Dataloader::Source
  def fetch(parent_ids)
    children = Category.where(parent_id: parent_ids).group_by(&:parent_id)
    parent_ids.map { |id| children[id] || [] }
  end
end
