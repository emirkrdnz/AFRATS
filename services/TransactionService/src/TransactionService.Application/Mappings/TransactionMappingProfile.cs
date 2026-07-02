namespace TransactionService.Application.Mappings;

using AutoMapper;
using TransactionService.Application.DTOs.Category;
using TransactionService.Application.DTOs.Transaction;
using TransactionService.Domain.Entities;

public class TransactionMappingProfile : Profile
{
    public TransactionMappingProfile()
    {
        // Transaction -> TransactionDto
        CreateMap<Transaction, TransactionDto>()
            .ForCtorParam(nameof(TransactionDto.Type), opt => opt.MapFrom(src => src.Type.ToString()))
            .ForCtorParam(nameof(TransactionDto.CategoryName), opt => opt.MapFrom(src => src.Category.Name));

        // Category -> CategoryDto
        CreateMap<Category, CategoryDto>()
            .ForCtorParam(nameof(CategoryDto.Type), opt => opt.MapFrom(src => src.Type.ToString()));
    }
}
