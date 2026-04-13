class Dataloaders::RecordById < GraphQL::Dataloader::Source
  def initialize(model_class)
    @model_class = model_class
    super()
  end

  def fetch(ids)
    records = @model_class.where(id: ids).index_by(&:id)
    ids.map { |id| records[id] }
  end
end
